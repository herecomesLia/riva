import { env } from "@/app/env"
import * as rolesMockService from "@/mocks/services/roles"
import type {
  ArchiveTargetRoleInput,
  CreateTargetRoleInput,
  DeleteTargetRoleInput,
  GenerateOrRegenerateMatchingAnalysisInput,
  GetJobDescriptionParsingStatusInput,
  GetMatchingAnalysisStatusInput,
  RolesPageResponse,
  SaveTargetRoleJobDescriptionInput,
  SetCurrentTargetRoleInput,
  StartOrRetryJobDescriptionParsingInput,
  TargetRole,
  UpdateJobDescriptionAnalysisModuleInput,
  UpdateTargetRoleInput,
  UpdateTargetRolePreparationStatusInput,
} from "@/models/roles"
import { rolesPageResponseSchema, targetRoleResponseSchema } from "@/schemas/roles"
import { apiRequest } from "@/services/api"

export type RolesCapabilities = {
  jobDescriptionAnalysis: boolean
  matchingAnalysis: boolean
}

const allRolesCapabilities: RolesCapabilities = {
  jobDescriptionAnalysis: true,
  matchingAnalysis: true,
}

export const rolesCapabilities = allRolesCapabilities

async function requestRolesPage(
  path: string,
  options?: Parameters<typeof apiRequest>[1],
): Promise<RolesPageResponse> {
  return rolesPageResponseSchema.parse(await apiRequest<unknown>(path, options))
}

async function requestTargetRole(
  path: string,
  options?: Parameters<typeof apiRequest>[1],
): Promise<TargetRole> {
  return targetRoleResponseSchema.parse(await apiRequest<unknown>(path, options))
}

export function getRolesPage(): Promise<RolesPageResponse> {
  if (env.mock) return rolesMockService.getRolesPage()
  return requestRolesPage("/roles")
}

export function createTargetRole(input: CreateTargetRoleInput): Promise<RolesPageResponse> {
  if (env.mock) return rolesMockService.createTargetRole(input)
  return requestRolesPage("/roles", { json: input, method: "POST" })
}

export function updateTargetRole(input: UpdateTargetRoleInput): Promise<RolesPageResponse> {
  if (env.mock) return rolesMockService.updateTargetRole(input)
  const { roleId, ...request } = input
  return requestRolesPage(`/roles/${encodeURIComponent(roleId)}`, {
    json: request,
    method: "PATCH",
  })
}

export function setCurrentTargetRole(input: SetCurrentTargetRoleInput): Promise<RolesPageResponse> {
  if (env.mock) return rolesMockService.setCurrentTargetRole(input)
  return requestRolesPage(`/roles/${encodeURIComponent(input.roleId)}/current`, {
    json: { version: input.version },
    method: "PUT",
  })
}

export function updateRolePreparationStatus(
  input: UpdateTargetRolePreparationStatusInput,
): Promise<RolesPageResponse> {
  if (env.mock) return rolesMockService.updateRolePreparationStatus(input)
  const { roleId, ...request } = input
  return requestRolesPage(`/roles/${encodeURIComponent(roleId)}/preparation-status`, {
    json: request,
    method: "PATCH",
  })
}

export function archiveTargetRole(input: ArchiveTargetRoleInput): Promise<RolesPageResponse> {
  if (env.mock) return rolesMockService.archiveTargetRole(input)
  return requestRolesPage(`/roles/${encodeURIComponent(input.roleId)}/archive`, {
    json: { version: input.version },
    method: "POST",
  })
}

export function deleteTargetRole(input: DeleteTargetRoleInput): Promise<RolesPageResponse> {
  if (env.mock) return rolesMockService.deleteTargetRole(input)
  const query = new URLSearchParams({ version: String(input.version) })
  return requestRolesPage(`/roles/${encodeURIComponent(input.roleId)}?${query}`, {
    method: "DELETE",
  })
}

export function saveJobDescription(
  input: SaveTargetRoleJobDescriptionInput,
): Promise<RolesPageResponse> {
  if (env.mock) return rolesMockService.saveJobDescription(input)
  const { roleId, ...request } = input
  return requestRolesPage(`/roles/${encodeURIComponent(roleId)}/job-description`, {
    json: request,
    method: "PUT",
  })
}

export function startJobDescriptionParsing(
  input: StartOrRetryJobDescriptionParsingInput,
): Promise<RolesPageResponse> {
  if (env.mock) return rolesMockService.startJobDescriptionParsing(input)
  const { roleId, ...request } = input
  return requestRolesPage(`/roles/${encodeURIComponent(roleId)}/job-description/parsing`, {
    json: request,
    method: "POST",
  })
}

export function getJobDescriptionParsingStatus(
  input: GetJobDescriptionParsingStatusInput,
): Promise<TargetRole> {
  if (env.mock) return rolesMockService.getJobDescriptionParsingStatus(input)
  const query = new URLSearchParams({
    version: String(input.version),
    jobDescriptionVersion: String(input.jobDescriptionVersion),
  })
  return requestTargetRole(
    `/roles/${encodeURIComponent(input.roleId)}/job-description/parsing?${query}`,
  )
}

export function generateMatchingAnalysis(
  input: GenerateOrRegenerateMatchingAnalysisInput,
): Promise<RolesPageResponse> {
  if (env.mock) return rolesMockService.generateMatchingAnalysis(input)
  return requestRolesPage(`/roles/${encodeURIComponent(input.roleId)}/matching-analysis`, {
    json: { version: input.version },
    method: "POST",
  })
}

export function getMatchingAnalysisStatus(
  input: GetMatchingAnalysisStatusInput,
): Promise<TargetRole> {
  if (env.mock) return rolesMockService.getMatchingAnalysisStatus(input)
  const query = new URLSearchParams({ version: String(input.version) })
  return requestTargetRole(`/roles/${encodeURIComponent(input.roleId)}/matching-analysis?${query}`)
}

export function updateJobDescriptionAnalysisModule(
  input: UpdateJobDescriptionAnalysisModuleInput,
): Promise<RolesPageResponse> {
  if (env.mock) return rolesMockService.updateJobDescriptionAnalysisModule(input)
  const { roleId, ...request } = input
  return requestRolesPage(`/roles/${encodeURIComponent(roleId)}/job-description/analysis`, {
    json: request,
    method: "PATCH",
  })
}
