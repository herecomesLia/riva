import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import { trainingRecordQueryKeys } from "@/app/training-record-query"
import { dashboardQueryKeys } from "@/app/dashboard-query"
import { toPracticeEntryParameters, type PracticeEntrySearch } from "@/app/training-entry-search"
import type {
  PracticeServiceResponse,
  PracticePageResponse,
  PrepareNextPracticeSessionInput,
  StartPracticeSessionInput,
} from "@/models/practice"
import type { PracticeTrainingEntryResolution } from "@/models/training-entry"
import {
  getPracticePage,
  prepareNextPracticeSession,
  preparePracticeTrainingEntry,
  startPracticeSession,
} from "@/services/practice"

import {
  type PracticeMutationInputFor,
  type PracticeMutationKind,
  getPracticeResponseSession,
  synchronizePracticeMutationResponse,
} from "../practice-cache"

export const PRACTICE_QUERY_KEY = ["practice"] as const

export function usePracticeSession(entrySearch: PracticeEntrySearch) {
  const queryClient = useQueryClient()
  const prepareNextRoundLock = useRef(false)
  const preparingEntryKey = useRef<string | null>(null)
  const entryKey = entrySearch.entry === undefined ? null : JSON.stringify(entrySearch)
  const [entryPreparation, setEntryPreparation] = useState<{
    key: string | null
    status: "idle" | "pending" | "success" | "error"
    resolution?: PracticeTrainingEntryResolution
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
  const prepareEntryMutation = useMutation({ mutationFn: preparePracticeTrainingEntry })

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
      .then(({ page, resolution }) => {
        queryClient.setQueryData(PRACTICE_QUERY_KEY, page)
        setEntryPreparation({ key: entryKey, status: "success", resolution })
      })
      .catch(() => setEntryPreparation({ key: entryKey, status: "error" }))
  }, [
    entryKey,
    entryPreparation,
    entrySearch,
    practiceQuery.data,
    prepareEntryMutation,
    queryClient,
  ])

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
    trainingEntryStatus:
      entryKey === null
        ? "inactive"
        : entryPreparation.key === entryKey
          ? entryPreparation.status
          : "pending",
    trainingEntryResolution:
      entryPreparation.key === entryKey && entryPreparation.status === "success"
        ? entryPreparation.resolution
        : undefined,
    retryTrainingEntry: () => {
      preparingEntryKey.current = null
      setEntryPreparation({ key: null, status: "idle" })
    },
  }
}

export function usePracticeMutation<
  TKind extends PracticeMutationKind,
  TInput extends PracticeMutationInputFor<TKind>,
>(kind: TKind, mutationFn: (input: TInput) => Promise<PracticeServiceResponse>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: (response, input) => {
      queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
        synchronizePracticeMutationResponse(current, response, { kind, input }),
      )
      if (getPracticeResponseSession(response).status === "completed") {
        void queryClient.invalidateQueries({ queryKey: trainingRecordQueryKeys.all })
        void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all })
      }
    },
  })
}
