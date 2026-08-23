import { createRolesMockResponse, type RolesMockScenario } from "@/mocks/data/roles"
import {
  createJobDescriptionAnalysisFixture,
  createMatchingAnalysisResultFixture,
} from "@/mocks/data/role-fixture-builders"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  ArchiveTargetRoleInput,
  CreateTargetRoleInput,
  DeleteTargetRoleInput,
  JobDescriptionAnalysis,
  MatchingAnalysis,
  ReadyTargetRole,
  RolesPageResponse,
  SaveTargetRoleJobDescriptionInput,
  SetCurrentTargetRoleInput,
  StartJobDescriptionParsingInput,
  StartMatchingAnalysisInput,
  TargetRole,
  UpdateJobDescriptionAnalysisModuleInput,
  UpdateTargetRoleInput,
  UpdateTargetRolePreparationStatusInput,
} from "@/models/roles"
import { ApiError } from "@/services/api"

function copy<T>(value: T): T {
  return structuredClone(value)
}

let mockResponse = createRolesMockResponse()
let createdRoleCount = 0
let timestampSequence = 0

export function resetRolesMockState(scenario: RolesMockScenario = "matchingAnalysisCurrent") {
  mockResponse = createRolesMockResponse(scenario)
  createdRoleCount = 0
  timestampSequence = 0
}

export function getRolesMockSnapshot(): RolesPageResponse {
  return copy(mockResponse)
}

function nextTimestamp() {
  const timestamp = new Date(Date.UTC(2026, 6, 16, 8, timestampSequence * 5)).toISOString()
  timestampSequence += 1
  return timestamp
}

function setMockResponse(response: RolesPageResponse) {
  mockResponse = copy(response)
  return copy(mockResponse)
}

function requireRole(roleId: string) {
  const role = mockResponse.roles.find((candidate) => candidate.id === roleId)
  if (!role) throw new Error("Target role was not found.")
  return role
}

function requireCurrentVersion(role: TargetRole, version: number) {
  if (role.version !== version) {
    const body = { error: "target_role_version_conflict" }
    throw new ApiError(409, body.error, body)
  }
}

function replaceRole(role: TargetRole) {
  return {
    ...mockResponse,
    roles: mockResponse.roles.map((candidate) => (candidate.id === role.id ? role : candidate)),
  }
}

function nextRoleVersion(role: TargetRole) {
  return { updatedAt: nextTimestamp(), version: role.version + 1 }
}

function createRivaSummary(analysis: JobDescriptionAnalysis) {
  const skills = [
    ...analysis.requiredSkills.programmingLanguages,
    ...analysis.requiredSkills.frameworksAndLibraries,
    ...analysis.requiredSkills.conceptsAndMethods,
  ].slice(0, 3)
  const responsibility = analysis.responsibilities[0]?.replace(/[。.]$/, "")
  const qualification = [
    ...analysis.qualificationRequirements.education,
    ...analysis.qualificationRequirements.majors,
    ...analysis.qualificationRequirements.experience,
  ][0]
  const preferred = analysis.preferredQualifications[0]
  const softSkill = analysis.softSkills[0]
  const domain = analysis.businessDomains[0]
  return [
    responsibility,
    skills.length ? `重点要求 ${skills.join("、")}` : null,
    qualification ? `任职资格包括 ${qualification}` : null,
    preferred ? `加分项为 ${preferred}` : null,
    softSkill ? `强调 ${softSkill}` : null,
    domain ? `业务领域为 ${domain}` : null,
  ]
    .filter(Boolean)
    .join("；")
}

function markMatchingAnalysisStale(matchingAnalysis: MatchingAnalysis | null) {
  if (matchingAnalysis?.status === "current")
    return { ...matchingAnalysis, status: "stale" as const }
  if (matchingAnalysis?.status === "stale") return matchingAnalysis
  return null
}

function invalidateMatchingAnalysisAfterAnalysisCorrection(
  matchingAnalysis: MatchingAnalysis | null,
) {
  if (matchingAnalysis?.status === "current" || matchingAnalysis?.status === "stale") {
    return { ...matchingAnalysis, status: "stale" as const }
  }
  return null
}

function isReadyTargetRole(role: TargetRole): role is ReadyTargetRole {
  return role.jobDescription.status === "ready" && role.jobDescriptionAnalysis !== null
}

function resolveFallbackCurrentRoleId(roles: TargetRole[], excludedRoleId?: string) {
  return (
    roles.find((role) => role.id !== excludedRoleId && role.preparationStatus === "preparing")
      ?.id ?? null
  )
}

export async function getRolesPage(): Promise<RolesPageResponse> {
  await waitForMockDelay()
  return copy(mockResponse)
}

export async function createTargetRole(input: CreateTargetRoleInput): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const createdAt = nextTimestamp()
  createdRoleCount += 1
  const becomesCurrent = mockResponse.roles.length === 0
  const role: TargetRole = {
    id: `role_created_${createdRoleCount}`,
    title: input.title,
    company: input.company,
    recruitmentType: input.recruitmentType,
    location: input.location,
    experienceRange: input.experienceRange,
    preparationStatus: input.preparationStatus,
    createdAt,
    updatedAt: createdAt,
    version: 1,
    jobDescription: {
      status: "missing",
      rawText: null,
      version: null,
    },
    jobDescriptionAnalysis: null,
    matchingAnalysis: null,
  }
  return setMockResponse({
    ...mockResponse,
    roles: [...mockResponse.roles, role],
    currentRoleId: becomesCurrent ? role.id : mockResponse.currentRoleId,
  })
}

export function addImportedTargetRole(input: {
  company: string | null
  location: string | null
  rawText: string
  title: string
}): string {
  const createdAt = nextTimestamp()
  createdRoleCount += 1
  const roleId = `30000000-0000-4000-8000-${createdRoleCount.toString().padStart(12, "0")}`
  const role: ReadyTargetRole = {
    company: input.company,
    createdAt,
    experienceRange: null,
    id: roleId,
    jobDescription: {
      rawText: input.rawText,
      status: "ready",
      version: 1,
    },
    jobDescriptionAnalysis: createJobDescriptionAnalysisFixture({
      jobDescriptionVersion: 1,
      parsedAt: createdAt,
    }),
    location: input.location,
    matchingAnalysis: null,
    preparationStatus: "preparing",
    recruitmentType: null,
    title: input.title,
    updatedAt: createdAt,
    version: 1,
  }
  setMockResponse({
    ...mockResponse,
    currentRoleId: mockResponse.roles.length === 0 ? roleId : mockResponse.currentRoleId,
    roles: [...mockResponse.roles, role],
  })
  return roleId
}

export async function updateTargetRole(input: UpdateTargetRoleInput): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  requireCurrentVersion(role, input.version)
  const updatedRole: TargetRole = {
    ...role,
    ...nextRoleVersion(role),
    title: input.title,
    company: input.company,
    recruitmentType: input.recruitmentType,
    location: input.location,
    experienceRange: input.experienceRange,
  }
  return setMockResponse(replaceRole(updatedRole))
}

export async function setCurrentTargetRole(
  input: SetCurrentTargetRoleInput,
): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  requireCurrentVersion(role, input.version)
  if (role.preparationStatus === "archived") {
    throw new Error("An archived target role cannot be current.")
  }

  return setMockResponse({
    ...mockResponse,
    currentRoleId: role.id,
  })
}

export async function updateRolePreparationStatus(
  input: UpdateTargetRolePreparationStatusInput,
): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  requireCurrentVersion(role, input.version)
  const updatedRole: TargetRole = {
    ...role,
    ...nextRoleVersion(role),
    preparationStatus: input.preparationStatus,
  }
  return setMockResponse(replaceRole(updatedRole))
}

export async function archiveTargetRole(input: ArchiveTargetRoleInput): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  requireCurrentVersion(role, input.version)

  const archivedRole: TargetRole = {
    ...role,
    ...nextRoleVersion(role),
    preparationStatus: "archived",
  }
  const rolesAfterArchive = mockResponse.roles.map((candidate) =>
    candidate.id === role.id ? archivedRole : candidate,
  )
  const wasCurrent = mockResponse.currentRoleId === role.id
  const currentRoleId = wasCurrent
    ? resolveFallbackCurrentRoleId(rolesAfterArchive, role.id)
    : mockResponse.currentRoleId

  return setMockResponse({ ...mockResponse, currentRoleId, roles: rolesAfterArchive })
}

export async function deleteTargetRole(input: DeleteTargetRoleInput): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  requireCurrentVersion(role, input.version)

  const remainingRoles = mockResponse.roles.filter((candidate) => candidate.id !== role.id)
  const wasCurrent = mockResponse.currentRoleId === role.id
  const currentRoleId = wasCurrent
    ? resolveFallbackCurrentRoleId(remainingRoles, role.id)
    : mockResponse.currentRoleId

  return setMockResponse({ ...mockResponse, currentRoleId, roles: remainingRoles })
}

export async function saveJobDescription(
  input: SaveTargetRoleJobDescriptionInput,
): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  requireCurrentVersion(role, input.version)
  const rawText = input.rawText.trim()
  if (!rawText) throw new Error("Job description text is required.")

  const jobDescriptionVersion = (role.jobDescription.version ?? 0) + 1
  const updatedRole: TargetRole = {
    ...role,
    ...nextRoleVersion(role),
    jobDescription: {
      status: "saved",
      rawText,
      version: jobDescriptionVersion,
    },
    jobDescriptionAnalysis: null,
    matchingAnalysis: markMatchingAnalysisStale(role.matchingAnalysis),
  }
  return setMockResponse(replaceRole(updatedRole))
}

export async function startJobDescriptionParsing(
  input: StartJobDescriptionParsingInput,
): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  requireCurrentVersion(role, input.version)
  if (role.jobDescription.status !== "saved") {
    throw new Error("Save a job description before starting parsing.")
  }
  if (role.jobDescription.version !== input.jobDescriptionVersion) {
    throw new Error("Job description version is out of date.")
  }
  if (role.jobDescription.status === "ready") {
    return copy(mockResponse)
  }

  if (role.jobDescription.rawText.toLowerCase().includes("unparseable")) {
    throw new Error("The job description could not be parsed.")
  }

  const jobDescriptionVersion = role.jobDescription.version
  const readyRole: ReadyTargetRole = {
    ...role,
    ...nextRoleVersion(role),
    jobDescription: {
      ...role.jobDescription,
      status: "ready",
    },
    jobDescriptionAnalysis: createJobDescriptionAnalysisFixture({
      jobDescriptionVersion,
      parsedAt: nextTimestamp(),
    }),
  }
  return setMockResponse(replaceRole(readyRole))
}

export async function generateMatchingAnalysis(
  input: StartMatchingAnalysisInput,
): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  requireCurrentVersion(role, input.version)
  if (!mockResponse.profileContext.exists || !mockResponse.profileContext.completed) {
    throw new Error("A completed job profile is required to generate matching analysis.")
  }
  if (!isReadyTargetRole(role)) {
    throw new Error("A parsed job description is required to generate matching analysis.")
  }
  if (role.matchingAnalysis?.status === "current") {
    return copy(mockResponse)
  }

  const readyRole: ReadyTargetRole = {
    ...role,
    ...nextRoleVersion(role),
    matchingAnalysis: {
      status: "current",
      profileVersion: mockResponse.profileContext.version,
      jobDescriptionVersion: role.jobDescription.version,
      jobDescriptionAnalysisVersion: role.jobDescriptionAnalysis.analysisVersion,
      generatedAt: nextTimestamp(),
      result: createMatchingAnalysisResultFixture(),
    },
  }
  return setMockResponse(replaceRole(readyRole))
}

export async function updateJobDescriptionAnalysisModule(
  input: UpdateJobDescriptionAnalysisModuleInput,
): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  requireCurrentVersion(role, input.version)
  if (!isReadyTargetRole(role)) {
    throw new Error("A parsed job description is required to update structured JD analysis.")
  }
  if (role.jobDescription.version !== input.jobDescriptionVersion) {
    throw new Error("Job description version is out of date.")
  }
  if (role.jobDescriptionAnalysis.analysisVersion !== input.analysisVersion) {
    throw new Error("Job description analysis version is out of date.")
  }
  if (!isValidAnalysisModuleValue(input)) {
    throw new Error("Structured JD analysis field value is invalid.")
  }

  const nextAnalysis: JobDescriptionAnalysis = {
    ...role.jobDescriptionAnalysis,
    [input.field]: copy(input.value),
  }
  const updatedRole: ReadyTargetRole = {
    ...role,
    ...nextRoleVersion(role),
    jobDescriptionAnalysis: {
      ...nextAnalysis,
      analysisVersion: role.jobDescriptionAnalysis.analysisVersion + 1,
      rivaSummary: createRivaSummary(nextAnalysis),
    },
    matchingAnalysis: invalidateMatchingAnalysisAfterAnalysisCorrection(role.matchingAnalysis),
  }
  return setMockResponse(replaceRole(updatedRole))
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isQualificationRequirements(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  return [
    "education",
    "graduationCohorts",
    "majors",
    "experience",
    "languages",
    "certifications",
    "other",
  ].every((key) => isStringList((value as Record<string, unknown>)[key]))
}

function isRequiredSkillGroups(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  return [
    "programmingLanguages",
    "frameworksAndLibraries",
    "platforms",
    "tools",
    "conceptsAndMethods",
    "databasesAndMiddleware",
    "other",
  ].every((key) => isStringList((value as Record<string, unknown>)[key]))
}

function isValidAnalysisModuleValue(input: UpdateJobDescriptionAnalysisModuleInput) {
  if (input.field === "qualificationRequirements") return isQualificationRequirements(input.value)
  if (input.field === "requiredSkills") return isRequiredSkillGroups(input.value)
  return isStringList(input.value)
}
