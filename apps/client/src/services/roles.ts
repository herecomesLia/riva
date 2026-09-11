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
  JobDescriptionResponse,
  TaskStatusResponse,
  TaskFailureResponse,
  UpdateJobDescriptionRequest,
  UpdateTargetRoleRequest,
} from "@/api/generated/models"
import { targetRoleFaker } from "@/mocks/fakers/target-role"
import type {
  JdState,
  MatchState,
  RecognizeRoleInput,
  RolesData,
} from "@/models/target-role-workflow"
import { getProfile } from "@/services/profile"

export function getJdExtractionState(
  roleId: string,
): Promise<TaskStatusResponse | TaskFailureResponse> {
  return getJdExtractionStateRequest(roleId)
}

export function abortJdExtraction(roleId: string): Promise<void> {
  return abortJdExtractionRequest(roleId)
}

export function toJdState(
  state: TaskStatusResponse | TaskFailureResponse,
  jd: JobDescriptionResponse,
): JdState {
  if (state.status === "failed") return { status: "failed", reason: state.error.message }
  if (state.status !== "idle") return { status: "extracting", phase: state.status }
  const hasContent =
    jd.responsibilities.length > 0 ||
    Object.values(jd.requirements).some((items) => items.length > 0) ||
    Object.values(jd.hardSkills).some((items) => items.length > 0) ||
    jd.softSkills.length > 0 ||
    jd.preferredQualifications.length > 0 ||
    jd.businessDomains.length > 0
  return hasContent ? { status: "ready", result: jd } : { status: "missing" }
}

export async function getRoles(): Promise<RolesData> {
  const [initialResponse, profile] = await Promise.all([listTargetRoles(), getProfile()])
  const states = new Map(
    await Promise.all(
      initialResponse.targetRoles.map(
        async (role) => [role.id, await getJdExtractionState(role.id)] as const,
      ),
    ),
  )
  // Read results after observing idle: extraction may have completed since the first list.
  const response = [...states.values()].some((state) => state.status === "idle")
    ? await listTargetRoles()
    : initialResponse
  const roles = await Promise.all(
    response.targetRoles.map(async (role) => ({
      ...role,
      jdState: toJdState(states.get(role.id) ?? (await getJdExtractionState(role.id)), role.jd),
      matchState: await targetRoleFaker.getMatch(role.id),
    })),
  )

  return {
    roles,
    activeRoleId: response.activeTargetRoleId,
    profile: {
      exists: profile !== null,
      complete:
        profile !== null &&
        profile.education.length > 0 &&
        profile.workExperiences.length > 0 &&
        profile.projects.length > 0 &&
        profile.skills.length > 0,
    },
  }
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

export function match(roleId: string): Promise<MatchState> {
  return targetRoleFaker.match(roleId)
}

export function pollMatch(roleId: string): Promise<MatchState> {
  return targetRoleFaker.pollMatch(roleId)
}
