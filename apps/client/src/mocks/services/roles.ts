import { createRolesMockResponse, type RolesMockScenario } from "@/mocks/data/roles"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  ArchiveTargetRoleInput,
  CreateTargetRoleInput,
  DeleteTargetRoleInput,
  GenerateOrRegenerateMatchingAnalysisInput,
  GetJobDescriptionParsingStatusInput,
  GetMatchingAnalysisStatusInput,
  JobDescriptionAnalysis,
  MatchingAnalysis,
  MatchingAnalysisResult,
  ReadyTargetRole,
  RolesPageResponse,
  SaveTargetRoleJobDescriptionInput,
  SetCurrentTargetRoleInput,
  StartOrRetryJobDescriptionParsingInput,
  TargetRole,
  UpdateJobDescriptionAnalysisModuleInput,
  UpdateTargetRoleInput,
  UpdateTargetRolePreparationStatusInput,
} from "@/models/roles"

function copy<T>(value: T): T {
  return structuredClone(value)
}

let mockResponse = createRolesMockResponse()
let createdRoleCount = 0
let timestampSequence = 0
const parsingAttempts = new Map<string, number>()

export function resetRolesMockState(scenario: RolesMockScenario = "matchingAnalysisCurrent") {
  mockResponse = createRolesMockResponse(scenario)
  createdRoleCount = 0
  timestampSequence = 0
  parsingAttempts.clear()
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
  if (role.version !== version) throw new Error("Target role version is out of date.")
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

function createJobDescriptionAnalysis(jobDescriptionVersion: number): JobDescriptionAnalysis {
  return {
    jobDescriptionVersion,
    analysisVersion: 1,
    parsedAt: nextTimestamp(),
    rivaSummary: "负责可扩展前端架构与复杂业务交付，重点要求 React、TypeScript 和跨团队协作能力。",
    responsibilities: [
      "负责商家运营产品的前端架构与交付。",
      "与产品、设计和后端团队协作，推进复杂业务流程。",
    ],
    qualificationRequirements: {
      education: ["本科及以上"],
      graduationCohorts: [],
      majors: ["计算机或相关专业"],
      experience: ["五年以上前端工程经验"],
      languages: [],
      certifications: [],
      other: [],
    },
    requiredSkills: {
      programmingLanguages: ["TypeScript"],
      frameworksAndLibraries: ["React"],
      platforms: [],
      tools: [],
      conceptsAndMethods: ["前端架构", "性能优化"],
      databasesAndMiddleware: [],
      other: [],
    },
    preferredQualifications: ["有实验平台建设经验", "熟悉无障碍设计"],
    softSkills: ["技术领导力", "跨团队沟通"],
    businessDomains: ["商家运营", "电商平台"],
  }
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

function createMatchingAnalysisResult(): MatchingAnalysisResult {
  return {
    overallMatchScore: 78,
    coreRequirementsSummary:
      "Lead complex React product delivery with strong engineering judgment and measurable impact.",
    matchedCapabilities: ["React architecture", "TypeScript", "Design systems"],
    missingCapabilities: ["Large-scale experimentation"],
    underrepresentedCapabilities: ["Cross-functional technical leadership"],
    resumeHighlights: [
      "Led the merchant operations console from architecture through delivery.",
      "Improved Core Web Vitals pass rate from 71% to 94%.",
    ],
    resumeGaps: [
      "Describe experimentation design and decision-making with more concrete examples.",
    ],
    highRiskQuestions: [
      "How did you align partner teams when frontend architecture decisions affected delivery scope?",
      "Which experiment metrics did you use to decide whether a product change should ship?",
    ],
    preparationRecommendations: [
      "Prepare a STAR narrative about balancing delivery speed and frontend quality.",
      "Quantify the impact of technical leadership across partner teams.",
    ],
  }
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

function parsingKey(role: TargetRole) {
  if (role.jobDescription.version === null) throw new Error("Job description is missing.")
  return `${role.id}:${role.jobDescription.version}`
}

function parsingShouldFail(role: TargetRole) {
  if (role.jobDescription.status !== "parsing") return false
  const text = role.jobDescription.rawText.toLowerCase()
  const key = parsingKey(role)
  const attempts = (parsingAttempts.get(key) ?? 0) + 1
  parsingAttempts.set(key, attempts)
  return text.includes("unparseable") || (text.includes("retryable") && attempts === 1)
}

function matchingShouldFail(role: ReadyTargetRole) {
  return role.jobDescription.rawText.toLowerCase().includes("analysis-failure")
}

function isReadyTargetRole(role: TargetRole): role is ReadyTargetRole {
  return role.jobDescription.status === "ready" && role.jobDescriptionAnalysis !== null
}

function pickCurrentFallback(roles: TargetRole[]) {
  return roles.find((role) => role.preparationStatus === "preparing") ?? null
}

function updateCurrentRole(roles: TargetRole[], currentRoleId: string | null) {
  const changedAt = nextTimestamp()
  return roles.map((role) => {
    const isCurrent = role.id === currentRoleId
    if (role.isCurrent === isCurrent) return role
    return { ...role, isCurrent, updatedAt: changedAt, version: role.version + 1 }
  })
}

function completeJobDescriptionParsing(role: TargetRole): TargetRole {
  if (role.jobDescription.status !== "parsing") return role
  const versionUpdate = nextRoleVersion(role)

  if (parsingShouldFail(role)) {
    return {
      ...role,
      ...versionUpdate,
      jobDescription: {
        ...role.jobDescription,
        status: "failed",
        parsingFailureReason:
          "We could not extract structured requirements from this JD. Please review the text and try again.",
      },
      jobDescriptionAnalysis: null,
    }
  }

  const jobDescriptionVersion = role.jobDescription.version
  return {
    ...role,
    ...versionUpdate,
    jobDescription: { ...role.jobDescription, status: "ready" },
    jobDescriptionAnalysis: createJobDescriptionAnalysis(jobDescriptionVersion),
  } as ReadyTargetRole
}

function completeMatchingAnalysis(role: TargetRole): TargetRole {
  const matchingAnalysis = role.matchingAnalysis
  if (matchingAnalysis?.status !== "generating") return role
  if (!isReadyTargetRole(role)) {
    throw new Error("A matching analysis requires a parsed job description.")
  }

  const versionUpdate = nextRoleVersion(role)
  if (matchingShouldFail(role)) {
    return {
      ...role,
      ...versionUpdate,
      matchingAnalysis: {
        ...matchingAnalysis,
        status: "failed",
        failureReason:
          "The matching analysis could not be generated right now. Your profile and JD are preserved; please try again.",
      },
    }
  }

  return {
    ...role,
    ...versionUpdate,
    matchingAnalysis: {
      ...matchingAnalysis,
      status: "current",
      generatedAt: nextTimestamp(),
      result: createMatchingAnalysisResult(),
    },
  }
}

export async function getRolesPage(): Promise<RolesPageResponse> {
  await waitForMockDelay()
  return copy(mockResponse)
}

export async function createTargetRole(input: CreateTargetRoleInput): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const createdAt = nextTimestamp()
  createdRoleCount += 1
  const isCurrent = mockResponse.currentRoleId === null
  const role: TargetRole = {
    id: `role_created_${createdRoleCount}`,
    title: input.title,
    company: input.company,
    recruitmentType: input.recruitmentType,
    location: input.location,
    experienceRange: input.experienceRange,
    preparationStatus: input.preparationStatus,
    isCurrent,
    createdAt,
    updatedAt: createdAt,
    version: 1,
    jobDescription: {
      status: "missing",
      rawText: null,
      version: null,
      parsingFailureReason: null,
    },
    jobDescriptionAnalysis: null,
    matchingAnalysis: null,
  }
  return setMockResponse({
    ...mockResponse,
    roles: [...mockResponse.roles, role],
    currentRoleId: isCurrent ? role.id : mockResponse.currentRoleId,
  })
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
    roles: updateCurrentRole(mockResponse.roles, role.id),
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
    isCurrent: false,
  }
  const rolesAfterArchive = mockResponse.roles.map((candidate) =>
    candidate.id === role.id ? archivedRole : candidate,
  )
  const fallback = role.isCurrent ? pickCurrentFallback(rolesAfterArchive) : null
  const currentRoleId = role.isCurrent ? (fallback?.id ?? null) : mockResponse.currentRoleId
  const roles = role.isCurrent
    ? updateCurrentRole(rolesAfterArchive, currentRoleId)
    : rolesAfterArchive

  return setMockResponse({ ...mockResponse, currentRoleId, roles })
}

export async function deleteTargetRole(input: DeleteTargetRoleInput): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  requireCurrentVersion(role, input.version)

  const remainingRoles = mockResponse.roles.filter((candidate) => candidate.id !== role.id)
  const fallback = role.isCurrent ? pickCurrentFallback(remainingRoles) : null
  const currentRoleId = role.isCurrent ? (fallback?.id ?? null) : mockResponse.currentRoleId
  const roles = role.isCurrent ? updateCurrentRole(remainingRoles, currentRoleId) : remainingRoles

  return setMockResponse({ ...mockResponse, currentRoleId, roles })
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
      status: "parsing",
      rawText,
      version: jobDescriptionVersion,
      parsingFailureReason: null,
    },
    jobDescriptionAnalysis: null,
    matchingAnalysis: markMatchingAnalysisStale(role.matchingAnalysis),
  }
  return setMockResponse(replaceRole(updatedRole))
}

export async function startJobDescriptionParsing(
  input: StartOrRetryJobDescriptionParsingInput,
): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  requireCurrentVersion(role, input.version)
  if (role.jobDescription.status === "missing") {
    throw new Error("Save a job description before starting parsing.")
  }
  if (role.jobDescription.version !== input.jobDescriptionVersion) {
    throw new Error("Job description version is out of date.")
  }
  if (role.jobDescription.status === "parsing" || role.jobDescription.status === "ready") {
    return copy(mockResponse)
  }

  const updatedRole: TargetRole = {
    ...role,
    ...nextRoleVersion(role),
    jobDescription: {
      ...role.jobDescription,
      status: "parsing",
      parsingFailureReason: null,
    },
    jobDescriptionAnalysis: null,
  }
  return setMockResponse(replaceRole(updatedRole))
}

export async function getJobDescriptionParsingStatus(
  input: GetJobDescriptionParsingStatusInput,
): Promise<TargetRole> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  if (
    role.version !== input.version ||
    role.jobDescription.version !== input.jobDescriptionVersion ||
    role.jobDescription.status !== "parsing"
  ) {
    return copy(role)
  }
  const completedRole = completeJobDescriptionParsing(role)
  setMockResponse(replaceRole(completedRole))
  return copy(completedRole)
}

export async function generateMatchingAnalysis(
  input: GenerateOrRegenerateMatchingAnalysisInput,
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
  if (
    role.matchingAnalysis?.status === "generating" ||
    role.matchingAnalysis?.status === "current"
  ) {
    return copy(mockResponse)
  }

  const updatedRole: ReadyTargetRole = {
    ...role,
    ...nextRoleVersion(role),
    matchingAnalysis: {
      status: "generating",
      profileVersion: mockResponse.profileContext.version,
      jobDescriptionVersion: role.jobDescription.version,
      jobDescriptionAnalysisVersion: role.jobDescriptionAnalysis.analysisVersion,
      generatedAt: null,
      failureReason: null,
      result: null,
    },
  }
  return setMockResponse(replaceRole(updatedRole))
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

export async function getMatchingAnalysisStatus(
  input: GetMatchingAnalysisStatusInput,
): Promise<TargetRole> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  if (role.version !== input.version || role.matchingAnalysis?.status !== "generating") {
    return copy(role)
  }
  const completedRole = completeMatchingAnalysis(role)
  setMockResponse(replaceRole(completedRole))
  return copy(completedRole)
}
