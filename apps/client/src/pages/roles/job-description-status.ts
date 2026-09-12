import type { RoleResponse, TaskFailureResponse, TaskStatusResponse } from "@/api/generated/models"
import { hasJobDescription } from "@/lib/job-description"

export function getJobDescriptionUiStatus(
  role: RoleResponse,
  task: TaskStatusResponse | TaskFailureResponse | undefined,
) {
  if (!task) return "loading"
  if (task.status === "failed") return "failed"
  if (task.status !== "idle") return "extracting"
  return hasJobDescription(role.jd) ? "ready" : "missing"
}
