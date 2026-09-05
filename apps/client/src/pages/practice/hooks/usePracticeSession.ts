import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { toPracticeEntryParameters, type PracticeEntrySearch } from "@/app/training-entry-search"
import type { ActiveSelection, PracticeData, PracticeSession } from "@/models/practice-workflow"
import type { PracticeTrainingEntryResolution } from "@/models/training-entry"
import {
  getPracticePage,
  prepareNextPracticeSession,
  preparePracticeTrainingEntry,
  startPracticeSession,
} from "@/services/practice"

export const PRACTICE_QUERY_KEY = ["practice"] as const

export function usePracticeSession(entrySearch: PracticeEntrySearch) {
  const queryClient = useQueryClient()
  const prepareNextRoundLock = useRef(false)
  const preparingEntryKey = useRef<string | null>(null)
  const entryKey = entrySearch.entry === "history" ? JSON.stringify(entrySearch) : null
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
  const startMutation = usePracticeMutation(startPracticeSession)
  const prepareNextRoundMutation = usePracticeMutation(prepareNextPracticeSession)
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

  async function start(input: ActiveSelection) {
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

    prepareNextRoundLock.current = true
    try {
      await prepareNextRoundMutation.mutateAsync()
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
    historyEntryResolution:
      entryPreparation.key === entryKey && entryPreparation.status === "success"
        ? entryPreparation.resolution
        : undefined,
    retryHistoryEntry: () => {
      preparingEntryKey.current = null
      setEntryPreparation({ key: null, status: "idle" })
    },
  }
}

export function usePracticeMutation<TInput = void>(
  mutationFn: (input: TInput) => Promise<PracticeSession>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => mutationFn(input),
    onSuccess: (response) => {
      queryClient.setQueryData<PracticeData>(PRACTICE_QUERY_KEY, (current) =>
        current ? { ...current, session: response } : current,
      )
    },
  })
}
