import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import type { GetQuestionGenerationStatusInput, PracticePageResponse } from "@/models/practice"
import { getQuestionGenerationStatus } from "@/services/practice"

import { synchronizeQuestionGenerationResponse } from "../practice-cache"
import { PRACTICE_QUERY_KEY } from "./usePracticeSession"

export function usePracticeGenerationPolling(data: PracticePageResponse | undefined) {
  const queryClient = useQueryClient()
  const generationSession = data?.session.status === "generatingQuestion" ? data.session : null
  const sessionId = generationSession?.sessionId
  const version = generationSession?.version
  const generationQuery = useQuery({
    enabled: generationSession !== null,
    queryFn: () => {
      if (!sessionId || version === undefined) {
        throw new Error("A generating practice session is required.")
      }
      return getQuestionGenerationStatus({ sessionId, version })
    },
    queryKey: [...PRACTICE_QUERY_KEY, "question-generation", sessionId, version],
    refetchInterval: (query) => (query.state.data?.status === "generatingQuestion" ? 500 : false),
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
      generationQuery.isError || generationQuery.errorUpdatedAt > generationQuery.dataUpdatedAt,
    isGenerationRetrying: generationQuery.isFetching,
    retryGeneration: () => {
      if (generationSession === null) return
      void generationQuery.refetch()
    },
  }
}
