import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import { env } from "@/app/env"
import { useAgentPolling } from "@/lib/agent-polling"
import type {
  GetPracticeEvaluationStatusInput,
  PracticePageResponse,
  RetryPracticeEvaluationInput,
} from "@/models/practice"
import { getPracticeEvaluationStatus, retryPracticeEvaluation } from "@/services/practice"

import {
  getPracticeResponseSession,
  synchronizePracticeEvaluationResponse,
} from "../practice-cache"
import { usePracticeMutation, PRACTICE_QUERY_KEY } from "./usePracticeSession"

export function usePracticeEvaluationPolling(data: PracticePageResponse | undefined) {
  const queryClient = useQueryClient()
  const retryLock = useRef(false)
  const retryMutation = usePracticeMutation("retryEvaluation", retryPracticeEvaluation)
  const evaluationSession = data?.session.status === "evaluating" ? data.session : null
  const sessionId = evaluationSession?.sessionId
  const version = evaluationSession?.version
  const questionId = evaluationSession?.question.id
  const polling = useAgentPolling(
    sessionId && version !== undefined && questionId
      ? `practice-evaluation:${sessionId}:${version}:${questionId}`
      : null,
  )
  const evaluationQuery = useQuery({
    enabled: evaluationSession !== null && !polling.isTimedOut,
    queryFn: () => {
      if (!sessionId || version === undefined || !questionId) {
        throw new Error("An evaluating practice session is required.")
      }
      return getPracticeEvaluationStatus({ sessionId, version, questionId })
    },
    queryKey: [...PRACTICE_QUERY_KEY, "evaluation", sessionId, version, questionId],
    refetchInterval: (query) =>
      query.state.data && getPracticeResponseSession(query.state.data).status === "evaluating"
        ? polling.getPollingInterval()
        : false,
    retry: false,
  })

  useEffect(() => {
    if (!evaluationQuery.data || !sessionId || version === undefined || !questionId) return

    const request: GetPracticeEvaluationStatusInput = { sessionId, version, questionId }
    queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
      synchronizePracticeEvaluationResponse(current, evaluationQuery.data, request),
    )
  }, [evaluationQuery.data, queryClient, questionId, sessionId, version])

  function retryEvaluation() {
    if (evaluationSession === null || retryMutation.isPending || retryLock.current) return

    if (polling.isTimedOut || !env.mock) {
      retryLock.current = true
      polling.reset()
      void evaluationQuery.refetch().finally(() => {
        retryLock.current = false
      })
      return
    }

    const input: RetryPracticeEvaluationInput = {
      sessionId: evaluationSession.sessionId,
      version: evaluationSession.version,
      questionId: evaluationSession.question.id,
    }
    retryLock.current = true
    void retryMutation
      .mutateAsync(input)
      .catch(() => undefined)
      .finally(() => {
        retryLock.current = false
      })
  }

  return {
    evaluationError:
      polling.isTimedOut ||
      evaluationQuery.isError ||
      evaluationQuery.errorUpdatedAt > evaluationQuery.dataUpdatedAt ||
      retryMutation.isError,
    evaluationPollingTimedOut: polling.isTimedOut,
    isEvaluationRetrying: env.mock ? retryMutation.isPending : evaluationQuery.isFetching,
    retryEvaluation,
  }
}
