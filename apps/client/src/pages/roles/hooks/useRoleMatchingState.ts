import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { TaskStatusResponse, TaskFailureResponse } from "@/api/generated/models"
import { getRoleMatchingState } from "@/services/roles"
import { rolesQueryKey, roleMatchingStateQueryKey, taskRefetchInterval } from "../queries"

export function useRoleMatchingState(roleId: string | null) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: roleMatchingStateQueryKey(roleId),
    enabled: roleId !== null,
    queryFn: async ({ signal }) => {
      const task = await getRoleMatchingState(roleId!, signal)
      signal.throwIfAborted()
      const previous = queryClient.getQueryData<TaskStatusResponse | TaskFailureResponse>(
        roleMatchingStateQueryKey(roleId),
      )
      if (
        task.status === "idle" &&
        previous &&
        previous.status !== "idle" &&
        previous.status !== "failed"
      ) {
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
  })
}
