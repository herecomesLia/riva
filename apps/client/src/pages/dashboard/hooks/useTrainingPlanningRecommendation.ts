import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { getCurrentInteractionLanguage } from "@/i18n/language"
import { useAgentPolling } from "@/lib/agent-polling"
import type {
  StartTrainingPlanningInput,
  TrainingPlanningStatusResponse,
} from "@/models/training-planning"
import {
  ensureCurrentTrainingPlanning,
  getTrainingPlanningStatus,
  startTrainingPlanning,
} from "@/services/training-planning"
import type { DashboardResponse } from "@/models/dashboard"

type CurrentRole = DashboardResponse["currentRole"]

export type TrainingPlanningRecommendationState =
  | { status: "inactive" }
  | { status: "loading" }
  | { status: "succeeded"; response: TrainingPlanningStatusResponse }
  | {
      status: "failed"
      response?: TrainingPlanningStatusResponse
      isRetrying: boolean
      onRetry: () => void
      pollingTimedOut?: boolean
    }

export function useTrainingPlanningRecommendation(
  currentRole: CurrentRole | null | undefined,
): TrainingPlanningRecommendationState {
  useTranslation()
  const queryClient = useQueryClient()
  const interactionLanguage = getCurrentInteractionLanguage()
  const targetRoleId = currentRole?.id ?? null
  const enabled = Boolean(
    currentRole?.profileCompleted && currentRole.jobDescriptionAdded && targetRoleId,
  )
  const currentQueryKey = [
    "training-planning",
    "current",
    targetRoleId ?? "inactive",
    interactionLanguage,
  ] as const
  const ensureQuery = useQuery({
    enabled,
    queryFn: () => ensureCurrentTrainingPlanning({ targetRoleId: targetRoleId! }),
    queryKey: currentQueryKey,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const runId = ensureQuery.data?.runId ?? null
  const polling = useAgentPolling(runId ? `training-planning:${runId}` : null)
  const statusQueryKey = ["training-planning", "status", runId ?? "inactive"] as const
  const statusQuery = useQuery({
    enabled: enabled && runId !== null && !polling.isTimedOut,
    initialData: ensureQuery.data,
    queryFn: () => getTrainingPlanningStatus(runId!),
    queryKey: statusQueryKey,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "queued" || status === "running" ? polling.getPollingInterval() : false
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const retryMutation = useMutation({
    mutationFn: (input: StartTrainingPlanningInput) => startTrainingPlanning(input),
    onSuccess: (response) => {
      queryClient.setQueryData(currentQueryKey, response)
    },
  })
  const response = statusQuery.data ?? ensureQuery.data

  if (!enabled) return { status: "inactive" }
  if (polling.isTimedOut) {
    return {
      status: "failed",
      response,
      isRetrying: statusQuery.isFetching,
      pollingTimedOut: true,
      onRetry: () => {
        polling.reset()
        void statusQuery.refetch()
      },
    }
  }
  if (statusQuery.isError) {
    return {
      status: "failed",
      response,
      isRetrying: statusQuery.isFetching,
      onRetry: () => {
        polling.reset()
        void statusQuery.refetch()
      },
    }
  }
  if (ensureQuery.isError) {
    return {
      status: "failed",
      response,
      isRetrying: retryMutation.isPending,
      onRetry: () => retryMutation.mutate(createRetryInput(targetRoleId!)),
    }
  }

  if (response === undefined || ensureQuery.isFetching || statusQuery.isFetching) {
    return { status: "loading" }
  }
  if (response.status === "queued" || response.status === "running") {
    return { status: "loading" }
  }
  if (response.status === "succeeded") {
    return { status: "succeeded", response }
  }
  return {
    status: "failed",
    response,
    isRetrying: retryMutation.isPending,
    onRetry: () => retryMutation.mutate(createRetryInput(targetRoleId!)),
  }
}

function createRetryInput(targetRoleId: string): StartTrainingPlanningInput {
  return {
    requestId: crypto.randomUUID(),
    targetRoleId,
  }
}
