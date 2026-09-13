import type {
  JobDescriptionResponse,
  TaskFailureResponse,
  TaskStatusResponse,
} from "@/api/generated/models"

export type JdField = Exclude<keyof JobDescriptionResponse, "updatedAt">
export type RoleResources = {
  jdTasksByRoleId: Record<string, TaskStatusResponse | TaskFailureResponse | undefined>
  matchingStatesByRoleId: Record<string, TaskStatusResponse | TaskFailureResponse | undefined>
}
