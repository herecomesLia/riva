import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import type {
  GetQuestionGenerationStatusInput,
  GetPracticeEvaluationStatusInput,
  EndPracticeFollowUpsInput,
  PracticePageResponse,
  PracticeQuestionMutationInput,
  RequestAnswerFrameworkInput,
  RequestEndPracticeSessionInput,
  RequestPracticeHintInput,
  RetryPracticeEvaluationInput,
  RetryCurrentPracticeQuestionInput,
  ContinueToNextPracticeQuestionInput,
  EndPracticeSessionInput,
  SetPracticeQuestionSavedInput,
  SetPracticeQuestionWeakInput,
  SkipPracticeQuestionInput,
  StartPracticeSessionInput,
  SubmitFollowUpAnswerInput,
  SubmitPrimaryAnswerInput,
} from "@/models/practice"
import {
  endPracticeFollowUps,
  getPracticePage,
  getPracticeEvaluationStatus,
  getNextQuestionGenerationStatus,
  getQuestionGenerationStatus,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  retryPracticeEvaluation,
  retryCurrentPracticeQuestion,
  continueToNextPracticeQuestion,
  endPracticeSession,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession,
  submitFollowUpAnswer,
  submitPrimaryAnswer,
} from "@/services/practice"

import {
  synchronizePracticeEvaluationResponse,
  synchronizePracticeMutationResponse,
  synchronizeQuestionGenerationResponse,
} from "./practice-cache"
import type { PracticeInteractionResult } from "./practice-interaction"
import { PracticeView } from "./PracticeView"

const PRACTICE_QUERY_KEY = ["practice"] as const

export function PracticePage() {
  const queryClient = useQueryClient()
  const questionMutationLock = useRef(false)
  const evaluationRetryLock = useRef(false)
  const practiceQuery = useQuery({
    queryFn: getPracticePage,
    queryKey: PRACTICE_QUERY_KEY,
    retry: false,
  })
  const startMutation = useMutation({
    mutationFn: startPracticeSession,
    onSuccess: (response) => queryClient.setQueryData(PRACTICE_QUERY_KEY, response),
  })
  const hintMutation = usePracticeMutation(requestPracticeHint)
  const frameworkMutation = usePracticeMutation(requestAnswerFramework)
  const savedMutation = usePracticeMutation(setQuestionSaved)
  const weakMutation = usePracticeMutation(setQuestionWeak)
  const submitAnswerMutation = usePracticeMutation(submitPrimaryAnswer)
  const submitFollowUpMutation = usePracticeMutation(submitFollowUpAnswer)
  const endFollowUpMutation = usePracticeMutation(endPracticeFollowUps)
  const skipMutation = usePracticeMutation(skipPracticeQuestion)
  const endMutation = usePracticeMutation(requestEndPracticeSession)
  const retryEvaluationMutation = usePracticeMutation(retryPracticeEvaluation)
  const retryCurrentMutation = usePracticeMutation(retryCurrentPracticeQuestion)
  const nextQuestionMutation = usePracticeMutation(continueToNextPracticeQuestion)
  const completeSessionMutation = usePracticeSessionMutation(endPracticeSession)
  const isQuestionMutationPending =
    hintMutation.isPending ||
    frameworkMutation.isPending ||
    savedMutation.isPending ||
    weakMutation.isPending ||
    submitAnswerMutation.isPending ||
    submitFollowUpMutation.isPending ||
    endFollowUpMutation.isPending ||
    skipMutation.isPending ||
    endMutation.isPending
  const generationSession =
    practiceQuery.data?.session.status === "generatingQuestion" ? practiceQuery.data.session : null
  const generationSessionId = generationSession?.sessionId
  const generationVersion = generationSession?.version
  const generationQuery = useQuery({
    enabled: generationSession !== null,
    queryFn: () => {
      if (!generationSessionId || generationVersion === undefined) {
        throw new Error("A generating practice session is required.")
      }
      const input = {
        sessionId: generationSessionId,
        version: generationVersion,
      }
      return generationSession.previousAttempt
        ? getNextQuestionGenerationStatus(input)
        : getQuestionGenerationStatus(input)
    },
    queryKey: [
      ...PRACTICE_QUERY_KEY,
      "question-generation",
      generationSessionId,
      generationVersion,
    ],
    refetchInterval: (query) =>
      query.state.data?.session.status === "generatingQuestion" ? 500 : false,
    retry: false,
  })
  const evaluationSession =
    practiceQuery.data?.session.status === "evaluating" ? practiceQuery.data.session : null
  const evaluationSessionId = evaluationSession?.sessionId
  const evaluationVersion = evaluationSession?.version
  const evaluationQuestionId = evaluationSession?.question.id
  const evaluationQuery = useQuery({
    enabled: evaluationSession !== null,
    queryFn: () => {
      if (!evaluationSessionId || evaluationVersion === undefined || !evaluationQuestionId) {
        throw new Error("An evaluating practice session is required.")
      }
      return getPracticeEvaluationStatus({
        sessionId: evaluationSessionId,
        version: evaluationVersion,
        questionId: evaluationQuestionId,
      })
    },
    queryKey: [
      ...PRACTICE_QUERY_KEY,
      "evaluation",
      evaluationSessionId,
      evaluationVersion,
      evaluationQuestionId,
    ],
    refetchInterval: (query) => (query.state.data?.session.status === "evaluating" ? 500 : false),
    retry: false,
  })

  useEffect(() => {
    if (!generationQuery.data || !generationSessionId || generationVersion === undefined) {
      return
    }

    const response = generationQuery.data
    const request: GetQuestionGenerationStatusInput = {
      sessionId: generationSessionId,
      version: generationVersion,
    }
    queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
      synchronizeQuestionGenerationResponse(current, response, request),
    )
  }, [generationQuery.data, generationSessionId, generationVersion, queryClient])

  useEffect(() => {
    if (
      !evaluationQuery.data ||
      !evaluationSessionId ||
      evaluationVersion === undefined ||
      !evaluationQuestionId
    ) {
      return
    }

    const request: GetPracticeEvaluationStatusInput = {
      sessionId: evaluationSessionId,
      version: evaluationVersion,
      questionId: evaluationQuestionId,
    }
    const response = evaluationQuery.data
    queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
      synchronizePracticeEvaluationResponse(current, response, request),
    )
  }, [
    evaluationQuery.data,
    evaluationQuestionId,
    evaluationSessionId,
    evaluationVersion,
    queryClient,
  ])

  async function start(input: StartPracticeSessionInput) {
    await startMutation.mutateAsync(input)
  }

  function retryGeneration() {
    if (practiceQuery.data?.session.status !== "generatingQuestion") return
    void generationQuery.refetch()
  }

  function retryEvaluation() {
    const session = practiceQuery.data?.session
    if (
      session?.status !== "evaluating" ||
      retryEvaluationMutation.isPending ||
      evaluationRetryLock.current
    ) {
      return
    }
    const input: RetryPracticeEvaluationInput = {
      sessionId: session.sessionId,
      version: session.version,
      questionId: session.question.id,
    }
    evaluationRetryLock.current = true
    void retryEvaluationMutation
      .mutateAsync(input)
      .catch(() => undefined)
      .finally(() => {
        evaluationRetryLock.current = false
      })
  }

  async function runQuestionMutation(
    operation: () => Promise<PracticePageResponse>,
  ): Promise<PracticeInteractionResult> {
    if (questionMutationLock.current) return "ignored"
    questionMutationLock.current = true
    try {
      await operation()
      return "executed"
    } finally {
      questionMutationLock.current = false
    }
  }

  if (practiceQuery.data !== undefined) {
    return (
      <PracticeView
        answeringActions={{
          onEnd: async (input: RequestEndPracticeSessionInput) => {
            return runQuestionMutation(() => endMutation.mutateAsync(input))
          },
          onRequestFramework: async (input: RequestAnswerFrameworkInput) => {
            return runQuestionMutation(() => frameworkMutation.mutateAsync(input))
          },
          onRequestHint: async (input: RequestPracticeHintInput) => {
            return runQuestionMutation(() => hintMutation.mutateAsync(input))
          },
          onSetSaved: async (input: SetPracticeQuestionSavedInput) => {
            return runQuestionMutation(() => savedMutation.mutateAsync(input))
          },
          onSetWeak: async (input: SetPracticeQuestionWeakInput) => {
            return runQuestionMutation(() => weakMutation.mutateAsync(input))
          },
          onSkip: async (input: SkipPracticeQuestionInput) => {
            return runQuestionMutation(() => skipMutation.mutateAsync(input))
          },
          onSubmitAnswer: async (input: SubmitPrimaryAnswerInput) => {
            return runQuestionMutation(() => submitAnswerMutation.mutateAsync(input))
          },
        }}
        answeringPending={{
          end: endMutation.isPending,
          framework: frameworkMutation.isPending,
          hint: hintMutation.isPending,
          interactionLocked: isQuestionMutationPending,
          saved: savedMutation.isPending,
          skip: skipMutation.isPending,
          submitAnswer: submitAnswerMutation.isPending,
          weak: weakMutation.isPending,
        }}
        followUpActions={{
          onEndFollowUps: async (input: EndPracticeFollowUpsInput) => {
            return runQuestionMutation(() => endFollowUpMutation.mutateAsync(input))
          },
          onSubmitFollowUp: async (input: SubmitFollowUpAnswerInput) => {
            return runQuestionMutation(() => submitFollowUpMutation.mutateAsync(input))
          },
        }}
        followUpPending={{
          end: endFollowUpMutation.isPending,
          interactionLocked: isQuestionMutationPending,
          submit: submitFollowUpMutation.isPending,
        }}
        reviewActions={{
          onSetSaved: async (input: SetPracticeQuestionSavedInput) => {
            return runQuestionMutation(() => savedMutation.mutateAsync(input))
          },
          onSetWeak: async (input: SetPracticeQuestionWeakInput) => {
            return runQuestionMutation(() => weakMutation.mutateAsync(input))
          },
          onRetryCurrent: async (input: RetryCurrentPracticeQuestionInput) => {
            return runQuestionMutation(() => retryCurrentMutation.mutateAsync(input))
          },
          onNextQuestion: async (input: ContinueToNextPracticeQuestionInput) => {
            return runQuestionMutation(() => nextQuestionMutation.mutateAsync(input))
          },
          onEndSession: async (input: EndPracticeSessionInput) => {
            return runQuestionMutation(() => completeSessionMutation.mutateAsync(input))
          },
        }}
        reviewPending={{
          interactionLocked:
            savedMutation.isPending ||
            weakMutation.isPending ||
            retryCurrentMutation.isPending ||
            nextQuestionMutation.isPending ||
            completeSessionMutation.isPending,
          end: completeSessionMutation.isPending,
          next: nextQuestionMutation.isPending,
          retry: retryCurrentMutation.isPending,
          saved: savedMutation.isPending,
          weak: weakMutation.isPending,
        }}
        content={{ status: "ready", data: practiceQuery.data }}
        evaluationError={
          evaluationQuery.isError ||
          evaluationQuery.errorUpdatedAt > evaluationQuery.dataUpdatedAt ||
          retryEvaluationMutation.isError
        }
        generationError={
          generationQuery.isError || generationQuery.errorUpdatedAt > generationQuery.dataUpdatedAt
        }
        isGenerationRetrying={generationQuery.isFetching}
        isEvaluationRetrying={retryEvaluationMutation.isPending}
        isStarting={startMutation.isPending}
        onRetryGeneration={retryGeneration}
        onRetryEvaluation={retryEvaluation}
        onStart={start}
        variant="default"
      />
    )
  }

  if (practiceQuery.isFetching) {
    return <PracticeView content={{ status: "loading" }} variant="default" />
  }

  if (practiceQuery.isError) {
    return (
      <PracticeView
        isRetrying={practiceQuery.isFetching}
        onRetry={() => void practiceQuery.refetch()}
        variant="error"
      />
    )
  }

  return <PracticeView content={{ status: "loading" }} variant="default" />
}

function usePracticeSessionMutation<TInput>(
  mutationFn: (input: TInput) => Promise<PracticePageResponse>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (response) => queryClient.setQueryData(PRACTICE_QUERY_KEY, response),
  })
}

function usePracticeMutation<TInput extends PracticeQuestionMutationInput>(
  mutationFn: (input: TInput) => Promise<PracticePageResponse>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: (response, input) => {
      queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
        synchronizePracticeMutationResponse(current, response, input),
      )
    },
  })
}
