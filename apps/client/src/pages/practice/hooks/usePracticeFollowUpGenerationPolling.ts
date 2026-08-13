import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import type { GetFollowUpGenerationStatusInput, PracticePageResponse } from "@/models/practice"
import { getFollowUpGenerationStatus } from "@/services/practice"

import { synchronizeFollowUpGenerationResponse } from "../practice-cache"
import { PRACTICE_QUERY_KEY } from "./usePracticeSession"

export function usePracticeFollowUpGenerationPolling(data: PracticePageResponse | undefined) {
  const queryClient = useQueryClient()
  const generationSession = data?.session.status === "generatingFollowUp" ? data.session : null
  const sessionId = generationSession?.sessionId
  const version = generationSession?.version
  const generationQuery = useQuery({
    enabled: generationSession !== null,
    queryFn: () => {
      if (!sessionId || version === undefined) {
        throw new Error("A generating follow-up session is required.")
      }
      return getFollowUpGenerationStatus({ sessionId, version })
    },
    queryKey: [...PRACTICE_QUERY_KEY, "follow-up-generation", sessionId, version],
    refetchInterval: (query) => (query.state.data?.status === "generatingFollowUp" ? 500 : false),
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
      generationQuery.isError || generationQuery.errorUpdatedAt > generationQuery.dataUpdatedAt,
    isFollowUpGenerationRetrying: generationQuery.isFetching,
    retryFollowUpGeneration: () => {
      if (generationSession === null) return
      void generationQuery.refetch()
    },
  }
}
