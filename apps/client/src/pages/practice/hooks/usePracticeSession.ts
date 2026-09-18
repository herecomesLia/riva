import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { ApiError } from "@/api/error"
import { toPracticeEntryParameters, type PracticeEntrySearch } from "@/app/training-entry-search"
import {
  toPracticeSession,
  toPracticeSetupContext,
  toPracticeSetupSelection,
} from "@/models/practice-response"
import type { ActiveSelection, PracticeData, PracticeSelection } from "@/models/practice-workflow"
import {
  resolvePracticeTrainingEntry,
  type PracticeTrainingEntryResolution,
} from "@/models/training-entry"
import { careerProfileQueryKey } from "@/pages/profile/hooks/useCareerProfileQueries"
import { createPractice, getActivePractice, getPractice } from "@/services/practices"
import { getCareerProfile } from "@/services/profile"
import { listRoles } from "@/services/roles"
import { rolesQueryKey } from "@/pages/roles/queries"
import { practiceTaskOptions, usePracticeTask } from "./usePracticeTask"

export const practiceSessionOptions = (id: string | null) => ({
  queryKey: ["practices", "session", id] as const,
  queryFn: async ({ signal }: { signal: AbortSignal }) => {
    const practice = id
      ? await getPractice(id, { signal })
      : ((await getActivePractice({ signal })) ?? null)
    if (practice && practice.rounds.length === 0) throw new Error("Practice has no current round.")
    return practice
  },
  retry: false as const,
  staleTime: 0,
})

export function usePracticeSession(entrySearch: PracticeEntrySearch) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selection, setSelection] = useState<PracticeSelection>()
  const [historyConsumed, setHistoryConsumed] = useState<string | null>(null)
  const [refreshRequired, setRefreshRequired] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const refreshTarget = useRef<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const historyKey = entrySearch.entry === "history" ? JSON.stringify(entrySearch) : null
  const roles = useQuery({ queryKey: rolesQueryKey, queryFn: listRoles, retry: false })
  const profileQuery = useQuery({
    queryKey: careerProfileQueryKey,
    queryFn: ({ signal }) => getCareerProfile(signal),
    retry: false,
  })
  const practiceQuery = useQuery({ ...practiceSessionOptions(selectedId), enabled: !busy })
  const practice = practiceQuery.data
  const task = usePracticeTask(practice, !busy && !refreshRequired)

  let data: PracticeData | undefined
  let historyEntryResolution: PracticeTrainingEntryResolution | undefined
  if (roles.data && practice !== undefined) {
    const setupContext = toPracticeSetupContext(roles.data)
    if (practice) {
      if (practice.endedAt !== null) {
        data = {
          setupContext,
          session: toPracticeSession(practice, { status: "idle", error: null }),
        }
      } else if (task.data) {
        const snapshot = { ...practice, rounds: [...practice.rounds.slice(0, -1), task.data.round] }
        data = { setupContext, session: toPracticeSession(snapshot, task.data.task) }
      }
    } else if (profileQuery.data !== undefined && profileQuery.data !== null) {
      let configuration = toPracticeSetupSelection(roles.data, selection)
      if (historyKey !== null && historyConsumed !== historyKey) {
        const input = toPracticeEntryParameters(entrySearch)
        const role = roles.data.roles.find(({ id }) => id === input.roleId)
        historyEntryResolution = resolvePracticeTrainingEntry(
          setupContext,
          configuration,
          input,
          !role
            ? { status: "unavailable", reason: "roleDeleted" }
            : role.isArchived
              ? { status: "unavailable", reason: "roleArchived" }
              : { status: "available" },
        )
        configuration = historyEntryResolution.configuration
      }
      data = { setupContext, session: { status: "setup", selection: configuration } }
    }
  }

  // Accepted commands have no snapshot. Keep actions locked until read-back succeeds.
  async function refresh(
    id = refreshTarget.current === undefined ? selectedId : refreshTarget.current,
  ) {
    const result = await queryClient.fetchQuery(practiceSessionOptions(id))
    if (result && result.endedAt === null) {
      await queryClient.fetchQuery(practiceTaskOptions(result.id, result.rounds.at(-1)!.id))
    }
    setRefreshRequired(false)
    setRefreshFailed(false)
    if (refreshTarget.current === null) setSelectedId(null)
    refreshTarget.current = undefined
  }

  async function refreshPrerequisites() {
    await Promise.all([
      roles.refetch({ throwOnError: true }),
      profileQuery.refetch({ throwOnError: true }),
      refresh(),
    ])
  }

  async function runAction(operation: () => Promise<string | null | void>) {
    if (lock.current) return "ignored" as const
    lock.current = true
    setBusy(true)
    try {
      await queryClient.cancelQueries({ queryKey: ["practices"] })
      const target = await operation()
      setRefreshRequired(true)
      refreshTarget.current = target === undefined ? selectedId : target
      if (typeof target === "string") setSelectedId(target)
      try {
        await refresh(target === undefined ? selectedId : target)
      } catch {
        setRefreshFailed(true)
        // Query error remains visible; never resubmit an accepted command as a read retry.
      }
      return "executed" as const
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === "resource.conflict" || error.code === "resource.not_found")
      ) {
        setRefreshRequired(true)
        try {
          await refreshPrerequisites()
        } catch {
          setRefreshFailed(true)
        }
      }
      throw error
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const startMutation = useMutation({
    mutationFn: async (input: ActiveSelection) => {
      await runAction(async () => {
        const created = await createPractice(input)
        setSelection(input)
        setHistoryConsumed(historyKey)
        return created.id
      })
    },
  })
  const retryRead = useMutation({
    mutationFn: async () => {
      await refreshPrerequisites()
    },
  })
  async function prepareNextRound() {
    if (data?.session.status !== "completed") return "ignored" as const
    return runAction(async () => {
      setSelection(data.session.selection)
      setHistoryConsumed(historyKey)
      // Ending already cleared the backend active pointer; no additional mutation is needed.
      return null
    })
  }

  const profileReadError = practice === null && profileQuery.isError
  const readError =
    refreshFailed ||
    roles.isError ||
    profileReadError ||
    practiceQuery.isError ||
    (practice?.endedAt === null && task.isError)
  const taskStatus = task.data?.task.status
  const taskBusy = taskStatus === "queued" || taskStatus === "running" || taskStatus === "aborting"
  const abandonBlocked = busy || refreshRequired || readError
  const profileRequired =
    practice === null && roles.data !== undefined && profileQuery.data === null
  return {
    data,
    prerequisite: profileRequired ? "profileMissing" : "ready",
    practice,
    task,
    busy,
    runAction,
    blocked: busy || refreshRequired || readError || taskBusy,
    abandonBlocked,
    readError,
    retryRead: () => retryRead.mutate(),
    isRetrying:
      retryRead.isPending ||
      practiceQuery.isFetching ||
      roles.isFetching ||
      profileQuery.isFetching ||
      task.isFetching,
    start: (input: ActiveSelection) => startMutation.mutateAsync(input),
    isStarting: startMutation.isPending,
    prepareNextRound,
    historyEntryResolution,
    activeHistoryEntry:
      historyKey !== null &&
      historyConsumed !== historyKey &&
      !!practice &&
      practice.endedAt === null,
  }
}
