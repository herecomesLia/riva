import { useQuery } from "@tanstack/react-query"
import type { PracticeResponse } from "@/api/generated/models"
import { getPracticeRound, getPracticeTaskState } from "@/services/practices"

export const practiceTaskOptions = (practiceId?: string, roundId?: string) => ({
  queryKey: ["practices", practiceId, "rounds", roundId, "task"] as const,
  queryFn: async ({ signal }: { signal: AbortSignal }) => {
    const task = await getPracticeTaskState(practiceId!, roundId!, { signal })
    // Read after task state so idle exposes its committed question/result.
    const round = await getPracticeRound(practiceId!, roundId!, { signal })
    return { task, round }
  },
  retry: false as const,
  staleTime: 0,
})

export function usePracticeTask(practice: PracticeResponse | null | undefined, enabled: boolean) {
  return useQuery({
    ...practiceTaskOptions(practice?.id, practice?.rounds.at(-1)?.id),
    enabled: enabled && !!practice && practice.endedAt === null,
    refetchInterval: (query) => {
      const status = query.state.data?.task.status
      return query.state.status !== "error" &&
        (status === "queued" || status === "running" || status === "aborting")
        ? 1000
        : false
    },
  })
}
