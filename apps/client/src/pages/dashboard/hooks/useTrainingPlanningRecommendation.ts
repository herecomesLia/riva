import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { getCurrentInteractionLanguage } from "@/i18n/language"
import type {
  StartTrainingPlanningInput,
  TrainingPlanningResponse,
} from "@/models/training-planning"
import { ensureCurrentTrainingPlanning, startTrainingPlanning } from "@/services/training-planning"
import type { DashboardResponse } from "@/models/dashboard"

type CurrentRole = DashboardResponse["currentRole"]

export type TrainingPlanningRecommendationState =
  | { status: "inactive" }
  | { status: "loading" }
  | { status: "succeeded"; response: TrainingPlanningResponse }
  | {
      status: "failed"
      response?: TrainingPlanningResponse
      isRetrying: boolean
      onRetry: () => void
    }

export function useTrainingPlanningRecommendation(
  currentRole: CurrentRole | null | undefined,
): TrainingPlanningRecommendationState {
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
  const retryMutation = useMutation({
    mutationFn: (input: StartTrainingPlanningInput) => startTrainingPlanning(input),
    onSuccess: (response) => {
      queryClient.setQueryData(currentQueryKey, response)
    },
  })
  const response = ensureQuery.data

  if (!enabled) return { status: "inactive" }
  if (ensureQuery.isError && response === undefined && !retryMutation.isPending) {
    return {
      status: "failed",
      response,
      isRetrying: retryMutation.isPending,
      onRetry: () => retryMutation.mutate(createRetryInput(targetRoleId!)),
    }
  }
  if (retryMutation.isError && response === undefined) {
    return {
      status: "failed",
      response,
      isRetrying: retryMutation.isPending,
      onRetry: () => retryMutation.mutate(createRetryInput(targetRoleId!)),
    }
  }

  if (response === undefined || ensureQuery.isFetching || retryMutation.isPending) {
    return { status: "loading" }
  }
  return { status: "succeeded", response }
}

function createRetryInput(targetRoleId: string): StartTrainingPlanningInput {
  return {
    requestId: crypto.randomUUID(),
    targetRoleId,
  }
}
