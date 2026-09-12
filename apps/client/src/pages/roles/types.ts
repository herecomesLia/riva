import type {
  JobDescriptionResponse,
  TaskFailureResponse,
  TaskStatusResponse,
} from "@/api/generated/models"
import type { MatchingAnalysisState } from "@/mocks/models/role"

export type JdField = keyof JobDescriptionResponse
export type RoleResources = {
  jdTasksByRoleId: Record<string, TaskStatusResponse | TaskFailureResponse | undefined>
  matchingByRoleId: Record<string, MatchingAnalysisState | undefined>
}
