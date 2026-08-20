import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { useAgentPolling } from "@/lib/agent-polling"
import type { GetQuestionGenerationStatusInput, PracticePageResponse } from "@/models/practice"
import { getQuestionGenerationStatus } from "@/services/practice"

import { synchronizeQuestionGenerationResponse } from "../practice-cache"
import { PRACTICE_QUERY_KEY } from "./usePracticeSession"

export function usePracticeGenerationPolling(data: PracticePageResponse | undefined) {
  const queryClient = useQueryClient()
  const generationSession = data?.session.status === "generatingQuestion" ? data.session : null
  const sessionId = generationSession?.sessionId
  const version = generationSession?.version
  const polling = useAgentPolling(
    sessionId && version !== undefined ? `practice-question:${sessionId}:${version}` : null,
  )
  const generationQuery = useQuery({
    enabled: generationSession !== null && !polling.isTimedOut,
    queryFn: () => {
      if (!sessionId || version === undefined) {
        throw new Error("A generating practice session is required.")
      }
      return getQuestionGenerationStatus({ sessionId, version })
    },
    queryKey: [...PRACTICE_QUERY_KEY, "question-generation", sessionId, version],
    refetchInterval: (query) =>
      query.state.data?.status === "generatingQuestion" ? polling.getPollingInterval() : false,
    retry: false,
  })

  useEffect(() => {
    if (!generationQuery.data || !sessionId || version === undefined) return

    const request: GetQuestionGenerationStatusInput = { sessionId, version }
    queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
      synchronizeQuestionGenerationResponse(current, generationQuery.data, request),
    )
  }, [generationQuery.data, queryClient, sessionId, version])

  return {
    generationError:
      polling.isTimedOut ||
      generationQuery.isError ||
      generationQuery.errorUpdatedAt > generationQuery.dataUpdatedAt,
    generationPollingTimedOut: polling.isTimedOut,
    isGenerationRetrying: generationQuery.isFetching,
    retryGeneration: () => {
      if (generationSession === null) return
      polling.reset()
      void generationQuery.refetch()
    },
  }
}
