import * as rolesEndpoints from "@/api/generated/endpoints/roles/roles"
import type {
  CreateRoleRequest,
  RoleResponse,
  TaskStatusResponse,
  TaskFailureResponse,
  UpdateJobDescriptionRequest,
  UpdateRoleRequest,
  RoleListResponse,
} from "@/api/generated/models"
import { roleFaker } from "@/mocks/fakers/role"
import type { MatchingAnalysisState, RecognizeRoleInput } from "@/mocks/models/role"

const rolesApi = rolesEndpoints.getRolesApi()

export function getJdExtractionState(
  roleId: string,
  signal?: AbortSignal,
): Promise<TaskStatusResponse | TaskFailureResponse> {
  return rolesApi.getJdExtractionState(roleId, { signal })
}

export function abortJdExtraction(roleId: string): Promise<void> {
  return rolesApi.abortJdExtraction(roleId)
}

export function getRoles(): Promise<RoleListResponse> {
  return rolesApi.listRoles()
}

export function createRole(input: CreateRoleRequest): Promise<RoleResponse> {
  return rolesApi.createRole(input)
}

export function recognizeRole(input: RecognizeRoleInput): Promise<RoleResponse> {
  return roleFaker.recognizeRole(input)
}

export function updateRole(roleId: string, input: UpdateRoleRequest): Promise<RoleResponse> {
  return rolesApi.updateRole(roleId, input)
}

export function setActiveRole(roleId: string): Promise<void> {
  return rolesApi.setActiveRole({ roleId: roleId })
}

export function archiveRole(roleId: string): Promise<RoleResponse> {
  return rolesApi.archiveRole(roleId)
}

export function restoreRole(roleId: string): Promise<RoleResponse> {
  return rolesApi.restoreRole(roleId)
}

export async function deleteRole(roleId: string): Promise<void> {
  await rolesApi.deleteRole(roleId)
  await roleFaker.clear(roleId)
}

export async function extractJd(roleId: string, text: string): Promise<void> {
  await rolesApi.extractJdFromText(roleId, { text })
  await roleFaker.staleMatch(roleId)
}

export async function retryJdExtraction(roleId: string): Promise<void> {
  await rolesApi.retryJdExtraction(roleId)
  await roleFaker.staleMatch(roleId)
}

export async function updateJd(
  roleId: string,
  input: UpdateJobDescriptionRequest,
): Promise<RoleResponse> {
  const role = await rolesApi.updateJd(roleId, input)
  await roleFaker.staleMatch(roleId)
  return role
}

export function match(roleId: string): Promise<MatchingAnalysisState> {
  return roleFaker.match(roleId)
}

export function getMatchingAnalysis(roleId: string): Promise<MatchingAnalysisState> {
  return roleFaker.getMatch(roleId)
}
