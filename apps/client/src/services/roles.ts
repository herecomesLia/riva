import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  listTargetRoles,
  restoreTargetRole,
  setActiveTargetRole,
  updateTargetRole,
  updateJd as updateJdRequest,
  extractJdFromText,
  getJdExtractionState as getJdExtractionStateRequest,
  retryJdExtraction as retryJdExtractionRequest,
  abortJdExtraction as abortJdExtractionRequest,
} from "@/api/generated/endpoints/target-roles/target-roles"
import type {
  CreateTargetRoleRequest,
  TargetRoleResponse,
  TaskStatusResponse,
  TaskFailureResponse,
  UpdateJobDescriptionRequest,
  UpdateTargetRoleRequest,
  TargetRoleListResponse,
} from "@/api/generated/models"
import { targetRoleFaker } from "@/mocks/fakers/target-role"
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

export function getRoles(): Promise<TargetRoleListResponse> {
  return listTargetRoles()
}

export function createRole(input: CreateTargetRoleRequest): Promise<TargetRoleResponse> {
  return createTargetRole(input)
}

export function recognizeRole(input: RecognizeRoleInput): Promise<TargetRoleResponse> {
  return targetRoleFaker.recognizeRole(input)
}

export function updateRole(
  roleId: string,
  input: UpdateTargetRoleRequest,
): Promise<TargetRoleResponse> {
  return updateTargetRole(roleId, input)
}

export function setActiveRole(roleId: string): Promise<void> {
  return setActiveTargetRole({ targetRoleId: roleId })
}

export function archiveRole(roleId: string): Promise<TargetRoleResponse> {
  return archiveTargetRole(roleId)
}

export function restoreRole(roleId: string): Promise<TargetRoleResponse> {
  return restoreTargetRole(roleId)
}

export async function deleteRole(roleId: string): Promise<void> {
  await deleteTargetRole(roleId)
  await targetRoleFaker.clear(roleId)
}

export async function extractJd(roleId: string, text: string): Promise<void> {
  await extractJdFromText(roleId, { text })
  await targetRoleFaker.staleMatch(roleId)
}

export async function retryJdExtraction(roleId: string): Promise<void> {
  await retryJdExtractionRequest(roleId)
  await targetRoleFaker.staleMatch(roleId)
}

export async function updateJd(
  roleId: string,
  input: UpdateJobDescriptionRequest,
): Promise<TargetRoleResponse> {
  const role = await updateJdRequest(roleId, input)
  await targetRoleFaker.staleMatch(roleId)
  return role
}

export function match(roleId: string): Promise<MatchingAnalysisState> {
  return targetRoleFaker.match(roleId)
}

export function getMatchingAnalysis(roleId: string): Promise<MatchingAnalysisState> {
  return targetRoleFaker.getMatch(roleId)
}
