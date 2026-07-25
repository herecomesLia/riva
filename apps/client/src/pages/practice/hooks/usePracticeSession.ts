import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import { trainingRecordQueryKeys } from "@/app/training-record-query"
import { dashboardQueryKeys } from "@/app/dashboard-query"
import { toPracticeEntryParameters, type PracticeEntrySearch } from "@/app/training-entry-search"
import type {
  PracticeMutationResponse,
  PracticePageResponse,
  PrepareNextPracticeSessionInput,
  StartPracticeSessionInput,
} from "@/models/practice"
import {
  getPracticePage,
  prepareNextPracticeSession,
  preparePracticeTrainingEntry,
  startPracticeSession,
} from "@/services/practice"

import {
  type PracticeMutationInputFor,
  type PracticeMutationKind,
  synchronizePracticeMutationResponse,
} from "../practice-cache"

export const PRACTICE_QUERY_KEY = ["practice"] as const

export function usePracticeSession(entrySearch: PracticeEntrySearch) {
  const queryClient = useQueryClient()
  const prepareNextRoundLock = useRef(false)
  const preparingEntryKey = useRef<string | null>(null)
  const entryKey = entrySearch.entry === "history" ? JSON.stringify(entrySearch) : null
  const [entryPreparation, setEntryPreparation] = useState<{
    key: string | null
    status: "idle" | "pending" | "success" | "error"
  }>({ key: null, status: "idle" })
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
  const prepareEntryMutation = useMutation({
    mutationFn: preparePracticeTrainingEntry,
    onSuccess: (response) => {
      queryClient.setQueryData(PRACTICE_QUERY_KEY, response)
    },
  })

  useEffect(() => {
    if (
      entryKey === null ||
      practiceQuery.data === undefined ||
      preparingEntryKey.current === entryKey ||
      (entryPreparation.key === entryKey && entryPreparation.status === "success")
    ) {
      return
    }

    preparingEntryKey.current = entryKey
    setEntryPreparation({ key: entryKey, status: "pending" })
    void prepareEntryMutation
      .mutateAsync(toPracticeEntryParameters(entrySearch))
      .then(() => setEntryPreparation({ key: entryKey, status: "success" }))
      .catch(() => setEntryPreparation({ key: entryKey, status: "error" }))
  }, [entryKey, entryPreparation, entrySearch, practiceQuery.data, prepareEntryMutation])

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
    historyEntryStatus:
      entryKey === null
        ? "inactive"
        : entryPreparation.key === entryKey
          ? entryPreparation.status
          : "pending",
    retryHistoryEntry: () => {
      preparingEntryKey.current = null
      setEntryPreparation({ key: null, status: "idle" })
    },
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
      if (response.session.status === "completed") {
        void queryClient.invalidateQueries({ queryKey: trainingRecordQueryKeys.all })
        void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all })
      }
    },
  })
}
