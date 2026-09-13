import type { Query } from "@tanstack/react-query"
import type { TaskStatusResponse, TaskFailureResponse } from "@/api/generated/models"

export const rolesQueryKey = ["roles"] as const
export const jdExtractionStateQueryKey = (roleId: string) =>
  ["roles", roleId, "jd-extraction"] as const
export const roleMatchingStateQueryKey = (roleId: string | null) =>
  ["roles", roleId, "matching"] as const
const TASK_POLL_INTERVAL_MS = 1000

export function taskRefetchInterval(query: Query<TaskStatusResponse | TaskFailureResponse>) {
  const status = query.state.data?.status
  return query.state.status !== "error" &&
    (status === "queued" || status === "running" || status === "aborting")
    ? TASK_POLL_INTERVAL_MS
    : false
}
