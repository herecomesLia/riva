import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { useAgentPolling } from "@/lib/agent-polling"
import type { GetFollowUpGenerationStatusInput, PracticePageResponse } from "@/models/practice"
import { getFollowUpGenerationStatus } from "@/services/practice"

import { synchronizeFollowUpGenerationResponse } from "../practice-cache"
import { PRACTICE_QUERY_KEY } from "./usePracticeSession"

export function usePracticeFollowUpGenerationPolling(data: PracticePageResponse | undefined) {
  const queryClient = useQueryClient()
  const generationSession = data?.session.status === "generatingFollowUp" ? data.session : null
  const sessionId = generationSession?.sessionId
  const version = generationSession?.version
  const polling = useAgentPolling(
    sessionId && version !== undefined ? `practice-follow-up:${sessionId}:${version}` : null,
  )
  const generationQuery = useQuery({
    enabled: generationSession !== null && !polling.isTimedOut,
    queryFn: () => {
      if (!sessionId || version === undefined) {
        throw new Error("A generating follow-up session is required.")
      }
      return getFollowUpGenerationStatus({ sessionId, version })
    },
    queryKey: [...PRACTICE_QUERY_KEY, "follow-up-generation", sessionId, version],
    refetchInterval: (query) =>
      query.state.data?.status === "generatingFollowUp" ? polling.getPollingInterval() : false,
    retry: false,
  })

  useEffect(() => {
    if (!generationQuery.data || !sessionId || version === undefined) return

    const request: GetFollowUpGenerationStatusInput = { sessionId, version }
    queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
      synchronizeFollowUpGenerationResponse(current, generationQuery.data, request),
    )
  }, [generationQuery.data, queryClient, sessionId, version])

  return {
    followUpGenerationError:
      polling.isTimedOut ||
      generationQuery.isError ||
      generationQuery.errorUpdatedAt > generationQuery.dataUpdatedAt,
    followUpGenerationPollingTimedOut: polling.isTimedOut,
    isFollowUpGenerationRetrying: generationQuery.isFetching,
    retryFollowUpGeneration: () => {
      if (generationSession === null) return
      polling.reset()
      void generationQuery.refetch()
    },
  }
}
