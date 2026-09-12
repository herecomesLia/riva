import {
  archiveRole as apiArchiveRole,
  createRole as apiCreateRole,
  deleteRole as apiDeleteRole,
  listRoles,
  restoreRole as apiRestoreRole,
  setActiveRole as apiSetActiveRole,
  updateRole as apiUpdateRole,
  updateJd as updateJdRequest,
  extractJdFromText,
  getJdExtractionState as getJdExtractionStateRequest,
  retryJdExtraction as retryJdExtractionRequest,
  abortJdExtraction as abortJdExtractionRequest,
} from "@/api/generated/endpoints/roles/roles"
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

export function getJdExtractionState(
  roleId: string,
  signal?: AbortSignal,
): Promise<TaskStatusResponse | TaskFailureResponse> {
  return getJdExtractionStateRequest(roleId, { signal })
}

export function abortJdExtraction(roleId: string): Promise<void> {
  return abortJdExtractionRequest(roleId)
}

export function getRoles(): Promise<RoleListResponse> {
  return listRoles()
}

export function createRole(input: CreateRoleRequest): Promise<RoleResponse> {
  return apiCreateRole(input)
}

export function recognizeRole(input: RecognizeRoleInput): Promise<RoleResponse> {
  return roleFaker.recognizeRole(input)
}

export function updateRole(roleId: string, input: UpdateRoleRequest): Promise<RoleResponse> {
  return apiUpdateRole(roleId, input)
}

export function setActiveRole(roleId: string): Promise<void> {
  return apiSetActiveRole({ roleId: roleId })
}

export function archiveRole(roleId: string): Promise<RoleResponse> {
  return apiArchiveRole(roleId)
}

export function restoreRole(roleId: string): Promise<RoleResponse> {
  return apiRestoreRole(roleId)
}

export async function deleteRole(roleId: string): Promise<void> {
  await apiDeleteRole(roleId)
  await roleFaker.clear(roleId)
}

export async function extractJd(roleId: string, text: string): Promise<void> {
  await extractJdFromText(roleId, { text })
  await roleFaker.staleMatch(roleId)
}

export async function retryJdExtraction(roleId: string): Promise<void> {
  await retryJdExtractionRequest(roleId)
  await roleFaker.staleMatch(roleId)
}

export async function updateJd(
  roleId: string,
  input: UpdateJobDescriptionRequest,
): Promise<RoleResponse> {
  const role = await updateJdRequest(roleId, input)
  await roleFaker.staleMatch(roleId)
  return role
}

export function match(roleId: string): Promise<MatchingAnalysisState> {
  return roleFaker.match(roleId)
}

export function getMatchingAnalysis(roleId: string): Promise<MatchingAnalysisState> {
  return roleFaker.getMatch(roleId)
}
