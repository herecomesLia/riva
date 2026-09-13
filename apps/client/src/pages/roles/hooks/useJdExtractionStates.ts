import { useQueries, useQueryClient } from "@tanstack/react-query"
import type { RoleResponse } from "@/api/generated/models"
import { getJdExtractionState } from "@/services/roles"
import { rolesQueryKey, jdExtractionStateQueryKey, taskRefetchInterval } from "../queries"

export function useJdExtractionStates(roles: RoleResponse[]) {
  const queryClient = useQueryClient()
  const queries = useQueries({
    queries: roles.map((role) => ({
      queryKey: jdExtractionStateQueryKey(role.id),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const task = await getJdExtractionState(role.id, signal)
        signal.throwIfAborted()
        if (task.status === "idle") {
          await queryClient.invalidateQueries(
            { queryKey: rolesQueryKey, exact: true },
            { throwOnError: true },
          )
          signal.throwIfAborted()
        }
        return task
      },
      retry: false,
      refetchInterval: taskRefetchInterval,
    })),
  })
  return {
    jdTasksByRoleId: Object.fromEntries(
      roles.map((role, index) => [role.id, queries[index]!.data]),
    ),
    jdSynchronizationErrorRoleIds: roles
      .filter((_, index) => queries[index]!.isError)
      .map((role) => role.id),
  }
}
