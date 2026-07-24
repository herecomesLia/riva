import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef } from "react"

import type {
  EndPracticeSessionInput,
  PracticePageResponse,
  PracticeQuestionMutationInput,
  PrepareNextPracticeSessionInput,
  PrepareNextPracticeSessionResult,
  StartPracticeSessionInput,
} from "@/models/practice"
import {
  getPracticePage,
  prepareNextPracticeSession,
  startPracticeSession,
} from "@/services/practice"

import {
  synchronizePracticeMutationResponse,
  synchronizePracticeSessionMutationResponse,
} from "../practice-cache"

export const PRACTICE_QUERY_KEY = ["practice"] as const

export function usePracticeSession() {
  const queryClient = useQueryClient()
  const prepareNextRoundLock = useRef(false)
  const practiceQuery = useQuery({
    queryFn: getPracticePage,
    queryKey: PRACTICE_QUERY_KEY,
    retry: false,
  })
  const startMutation = useMutation({
    mutationFn: startPracticeSession,
    onSuccess: (response) => queryClient.setQueryData(PRACTICE_QUERY_KEY, response),
  })
  const prepareNextRoundMutation = useMutation({
    mutationFn: prepareNextPracticeSession,
    onSuccess: (response) => {
      if (response === "ignored") return
      queryClient.setQueryData(PRACTICE_QUERY_KEY, response)
    },
  })

  async function start(input: StartPracticeSessionInput) {
    await startMutation.mutateAsync(input)
  }

  async function prepareNextRound() {
    const session = practiceQuery.data?.session
    if (
      prepareNextRoundLock.current ||
      session?.status !== "completed" ||
      prepareNextRoundMutation.isPending
    ) {
      return "ignored" as const
    }

    const input: PrepareNextPracticeSessionInput = {
      sessionId: session.sessionId,
      version: session.version,
    }
    prepareNextRoundLock.current = true
    try {
      const response: PrepareNextPracticeSessionResult =
        await prepareNextRoundMutation.mutateAsync(input)
      return response === "ignored" ? "ignored" : "executed"
    } finally {
      prepareNextRoundLock.current = false
    }
  }

  return {
    practiceQuery,
    start,
    isStarting: startMutation.isPending,
    prepareNextRound,
    isPreparingNextRound: prepareNextRoundMutation.isPending,
  }
}

export function usePracticeSessionMutation<TInput>(
  mutationFn: (input: TInput) => Promise<PracticePageResponse>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (response, input) =>
      queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
        synchronizePracticeSessionMutationResponse(
          current,
          response,
          input as EndPracticeSessionInput,
        ),
      ),
  })
}

export function usePracticeMutation<TInput extends PracticeQuestionMutationInput>(
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
