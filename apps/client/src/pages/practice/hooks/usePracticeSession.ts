import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef } from "react"

import type {
  PracticeMutationResponse,
  PracticePageResponse,
  PrepareNextPracticeSessionInput,
  StartPracticeSessionInput,
} from "@/models/practice"
import {
  getPracticePage,
  prepareNextPracticeSession,
  startPracticeSession,
} from "@/services/practice"

import {
  type PracticeMutationInputFor,
  type PracticeMutationKind,
  synchronizePracticeMutationResponse,
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
    onSuccess: (response, input) =>
      queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
        synchronizePracticeMutationResponse(current, response, {
          kind: "startSession",
          input,
        }),
      ),
  })
  const prepareNextRoundMutation = useMutation({
    mutationFn: prepareNextPracticeSession,
    onSuccess: (response, input) =>
      queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
        synchronizePracticeMutationResponse(current, response, {
          kind: "prepareNextSession",
          input,
        }),
      ),
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
      await prepareNextRoundMutation.mutateAsync(input)
      return "executed" as const
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

export function usePracticeMutation<
  TKind extends PracticeMutationKind,
  TInput extends PracticeMutationInputFor<TKind>,
>(kind: TKind, mutationFn: (input: TInput) => Promise<PracticeMutationResponse>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: (response, input) => {
      queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
        synchronizePracticeMutationResponse(current, response, { kind, input }),
      )
    },
  })
}
