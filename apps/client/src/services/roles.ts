import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  listTargetRoles,
  restoreTargetRole,
  setActiveTargetRole,
  updateTargetRole,
  updateTargetRoleJd,
} from "@/api/generated/endpoints/target-roles/target-roles"
import type {
  CreateTargetRoleRequest,
  TargetRoleResponse,
  UpdateJobDescriptionRequest,
  UpdateTargetRoleRequest,
} from "@/api/generated/models"
import { targetRoleFaker } from "@/mocks/fakers/target-role"
import type {
  JdState,
  MatchState,
  RecognizeRoleInput,
  RolesData,
  RoleView,
} from "@/models/target-role-workflow"
import { getProfile } from "@/services/profile"

export async function getRoles(): Promise<RolesData> {
  const [response, profile] = await Promise.all([listTargetRoles(), getProfile()])
  const roles = await Promise.all(
    response.targetRoles.map(async (role) => ({
      ...role,
      jdState: await targetRoleFaker.getJd(role),
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

export async function recognizeRole(input: RecognizeRoleInput): Promise<TargetRoleResponse> {
  const role = await createTargetRole(await targetRoleFaker.recognize(input))
  await targetRoleFaker.parseJd(role.id, input.sourceType === "text" ? input.text : "")
  return role
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

export function parseJd(roleId: string, text: string): Promise<JdState> {
  return targetRoleFaker.parseJd(roleId, text)
}

export async function pollJd(role: RoleView): Promise<RoleView> {
  const jdState = await targetRoleFaker.pollJd(role)
  const targetRole =
    jdState.status === "ready" ? await updateTargetRoleJd(role.id, jdState.result) : role
  return {
    ...targetRole,
    jdState,
    matchState: await targetRoleFaker.getMatch(role.id),
  }
}

export async function updateJd(
  roleId: string,
  input: UpdateJobDescriptionRequest,
): Promise<TargetRoleResponse> {
  const role = await updateTargetRoleJd(roleId, input)
  await targetRoleFaker.staleMatch(roleId)
  return role
}

export function match(roleId: string): Promise<MatchState> {
  return targetRoleFaker.match(roleId)
}

export function pollMatch(roleId: string): Promise<MatchState> {
  return targetRoleFaker.pollMatch(roleId)
}
