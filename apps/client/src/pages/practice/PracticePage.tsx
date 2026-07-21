import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import type {
  GetQuestionGenerationStatusInput,
  PracticePageResponse,
  PracticeQuestionMutationInput,
  RequestAnswerFrameworkInput,
  RequestEndPracticeSessionInput,
  RequestPracticeHintInput,
  SetPracticeQuestionSavedInput,
  SetPracticeQuestionWeakInput,
  SkipPracticeQuestionInput,
  StartPracticeSessionInput,
  SubmitPracticeAnswerInput,
} from "@/models/practice"
import {
  getPracticePage,
  getQuestionGenerationStatus,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession,
  submitPracticeAnswer,
} from "@/services/practice"

import {
  synchronizePracticeMutationResponse,
  synchronizeQuestionGenerationResponse,
} from "./practice-cache"
import { PracticeView } from "./PracticeView"

const PRACTICE_QUERY_KEY = ["practice"] as const

export function PracticePage() {
  const queryClient = useQueryClient()
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
  const submitAnswerMutation = usePracticeMutation(submitPracticeAnswer)
  const skipMutation = usePracticeMutation(skipPracticeQuestion)
  const endMutation = usePracticeMutation(requestEndPracticeSession)
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
      return getQuestionGenerationStatus({
        sessionId: generationSessionId,
        version: generationVersion,
      })
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

  async function start(input: StartPracticeSessionInput) {
    await startMutation.mutateAsync(input)
  }

  function retryGeneration() {
    if (practiceQuery.data?.session.status !== "generatingQuestion") return
    void startMutation.mutateAsync(practiceQuery.data.session.selection).catch(() => undefined)
  }

  if (practiceQuery.data !== undefined) {
    return (
      <PracticeView
        answeringActions={{
          onEnd: async (input: RequestEndPracticeSessionInput) => {
            await endMutation.mutateAsync(input)
          },
          onRequestFramework: async (input: RequestAnswerFrameworkInput) => {
            await frameworkMutation.mutateAsync(input)
          },
          onRequestHint: async (input: RequestPracticeHintInput) => {
            await hintMutation.mutateAsync(input)
          },
          onSetSaved: async (input: SetPracticeQuestionSavedInput) => {
            await savedMutation.mutateAsync(input)
          },
          onSetWeak: async (input: SetPracticeQuestionWeakInput) => {
            await weakMutation.mutateAsync(input)
          },
          onSkip: async (input: SkipPracticeQuestionInput) => {
            await skipMutation.mutateAsync(input)
          },
          onSubmitAnswer: async (input: SubmitPracticeAnswerInput) => {
            await submitAnswerMutation.mutateAsync(input)
          },
        }}
        answeringPending={{
          end: endMutation.isPending,
          framework: frameworkMutation.isPending,
          hint: hintMutation.isPending,
          saved: savedMutation.isPending,
          skip: skipMutation.isPending,
          submitAnswer: submitAnswerMutation.isPending,
          weak: weakMutation.isPending,
        }}
        content={{ status: "ready", data: practiceQuery.data }}
        generationError={generationQuery.isError}
        isStarting={startMutation.isPending}
        onRetryGeneration={retryGeneration}
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
