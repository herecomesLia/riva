import { useQueries, useQueryClient, type Query } from "@tanstack/react-query"

import type {
  TargetRoleResponse,
  TaskStatusResponse,
  TaskFailureResponse,
} from "@/api/generated/models"
import type { MatchingAnalysisState } from "@/mocks/models/role"
import { getJdExtractionState, getMatchingAnalysis } from "@/services/roles"

export const ROLES_QUERY_KEY = ["roles"] as const
export const jdTaskQueryKey = (roleId: string) => ["roles", roleId, "jd-extraction"] as const
export const matchingQueryKey = (roleId: string) => ["roles", roleId, "matching-analysis"] as const

export function useRoleQueries(roles: TargetRoleResponse[]) {
  const queryClient = useQueryClient()
  const jdQueries = useQueries({
    queries: roles.map((role) => ({
      queryKey: jdTaskQueryKey(role.id),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const task = await getJdExtractionState(role.id, signal)
        signal.throwIfAborted()
        if (task.status === "idle") {
          // The saved JD is authoritative only after the extraction has become idle.
          await queryClient.invalidateQueries(
            { queryKey: ROLES_QUERY_KEY, exact: true },
            { throwOnError: true },
          )
          signal.throwIfAborted()
        }
        if (
          queryClient.getQueryData<TaskStatusResponse | TaskFailureResponse>(
            jdTaskQueryKey(role.id),
          )?.status !== task.status
        ) {
          void queryClient.invalidateQueries({ queryKey: matchingQueryKey(role.id) })
        }
        return task
      },
      retry: false,
      refetchInterval: (query: Query<TaskStatusResponse | TaskFailureResponse>) => {
        const task = query.state.data
        return query.state.status !== "error" &&
          task &&
          task.status !== "idle" &&
          task.status !== "failed"
          ? 1000
          : false
      },
    })),
  })
  const matchingQueries = useQueries({
    queries: roles.map((role) => ({
      queryKey: matchingQueryKey(role.id),
      queryFn: () => getMatchingAnalysis(role.id),
      retry: false,
      refetchInterval: (query: Query<MatchingAnalysisState>) =>
        query.state.status !== "error" && query.state.data?.status === "generating" ? 1000 : false,
    })),
  })

  return {
    jdTasksByRoleId: Object.fromEntries(
      roles.map((role, index) => [role.id, jdQueries[index]!.data]),
    ),
    matchingByRoleId: Object.fromEntries(
      roles.map((role, index) => [role.id, matchingQueries[index]!.data]),
    ),
    jdSynchronizationErrorRoleIds: roles
      .filter((_, index) => jdQueries[index]!.isError)
      .map((role) => role.id),
    matchSynchronizationErrorRoleIds: roles
      .filter((_, index) => matchingQueries[index]!.isError)
      .map((role) => role.id),
  }
}
