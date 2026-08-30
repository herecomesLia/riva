import { createRolesMockResponse, type RolesMockScenario } from "@/mocks/data/roles"
import {
  createJobDescriptionAnalysisFixture,
  createMatchingAnalysisResultFixture,
} from "@/mocks/data/role-fixture-builders"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  ArchiveTargetRoleInput,
  CreateTargetRoleInput,
  CreateTargetRoleFromRecognitionInput,
  DeleteTargetRoleInput,
  GenerateOrRegenerateMatchingAnalysisInput,
  GetJobDescriptionParsingStatusInput,
  GetMatchingAnalysisStatusInput,
  JobDescriptionAnalysis,
  MatchingAnalysis,
  ReadyTargetRole,
  RecognizeTargetRoleInput,
  RolesPageResponse,
  SaveTargetRoleJobDescriptionInput,
  SetCurrentTargetRoleInput,
  StartOrRetryJobDescriptionParsingInput,
  TargetRole,
  TargetRoleRecognitionResult,
  UpdateJobDescriptionAnalysisModuleInput,
  UpdateTargetRoleInput,
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

function resolveFallbackCurrentRoleId(roles: TargetRole[], excludedRoleId?: string) {
  return roles.find((role) => role.id !== excludedRoleId && role.status === "active")?.id ?? null
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
    jobDescriptionAnalysis: createJobDescriptionAnalysisFixture({
      jobDescriptionVersion,
      parsedAt: nextTimestamp(),
    }),
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
      result: createMatchingAnalysisResultFixture(),
    },
  }
}

export async function getRolesPage(): Promise<RolesPageResponse> {
  await waitForMockDelay()
  return copy(mockResponse)
}

export async function createTargetRole(input: CreateTargetRoleInput): Promise<RolesPageResponse> {
  await waitForMockDelay()
  return createRole(input)
}

function createRole(
  input: CreateTargetRoleInput,
  recognizedJobDescription?: string,
): RolesPageResponse {
  const createdAt = nextTimestamp()
  createdRoleCount += 1
  const becomesCurrent = mockResponse.roles.length === 0
  const roleBase = {
    id: `role_created_${createdRoleCount}`,
    title: input.title,
    company: input.company,
    recruitmentType: input.recruitmentType,
    location: input.location,
    experienceRange: input.experienceRange,
    status: "active" as const,
    createdAt,
    updatedAt: createdAt,
    version: 1,
    matchingAnalysis: null,
  }
  const role: TargetRole = recognizedJobDescription
    ? {
        ...roleBase,
        jobDescription: {
          status: "parsing",
          rawText: recognizedJobDescription,
          version: 1,
          parsingFailureReason: null,
        },
        jobDescriptionAnalysis: null,
      }
    : {
        ...roleBase,
        jobDescription: {
          status: "missing",
          rawText: null,
          version: null,
          parsingFailureReason: null,
        },
        jobDescriptionAnalysis: null,
      }
  return setMockResponse({
    ...mockResponse,
    roles: [...mockResponse.roles, role],
    currentRoleId: becomesCurrent ? role.id : mockResponse.currentRoleId,
  })
}

export async function recognizeTargetRole(
  input: RecognizeTargetRoleInput,
): Promise<TargetRoleRecognitionResult> {
  await waitForMockDelay()
  return createRecognitionResult(input)
}

export async function createTargetRoleFromRecognition(
  input: CreateTargetRoleFromRecognitionInput,
): Promise<RolesPageResponse> {
  await waitForMockDelay()
  if (!input.recognitionId.trim()) throw new Error("Target role recognition is required.")
  const rawText = input.rawText.trim()
  if (!rawText) throw new Error("Recognized job description text is required.")
  return createRole(input, rawText)
}

function createRecognitionResult(input: RecognizeTargetRoleInput): TargetRoleRecognitionResult {
  if (input.sourceType === "text") {
    const rawText = input.text.trim()
    if (!rawText) throw new Error("Job posting text is required.")
    return {
      recognitionId: "recognition_text_1",
      sourceType: "text",
      sourceLabel: rawText.split(/\r?\n/, 1)[0] ?? "pasted-job-posting",
      rawText,
      suggestedRole: inferRoleBasics(rawText),
    }
  }

  if (input.sourceType === "image") {
    if (input.images.length === 0) throw new Error("At least one job posting image is required.")
    // UI-only fixture: the production adapter sends the original File[] to the vision Agent.
    const sourceLabel = input.images.map((image) => image.name).join(", ")
    const rawText = [
      "Frontend Engineer",
      "Company: Riva Technology",
      "Location: Shanghai",
      "3-5 years of experience",
      "Build accessible React interfaces and collaborate with product and design teams.",
      "Strong TypeScript, React, and frontend architecture skills are required.",
    ].join("\n")
    return {
      recognitionId: "recognition_image_1",
      sourceType: "image",
      sourceLabel,
      rawText,
      suggestedRole: inferRoleBasics(rawText),
    }
  }

  const url = input.url.trim()
  if (!url) throw new Error("A job posting URL is required.")
  const parsedUrl = new URL(url)
  const rawText = [
    "Product Manager",
    `Company: ${parsedUrl.hostname.replace(/^www\./, "")}`,
    "Location: Beijing",
    "Own product discovery, roadmap planning, delivery, and outcome measurement.",
    "Work closely with engineering, design, operations, and commercial teams.",
  ].join("\n")
  return {
    recognitionId: "recognition_url_1",
    sourceType: "url",
    sourceLabel: url,
    rawText,
    suggestedRole: inferRoleBasics(rawText),
  }
}

function inferRoleBasics(rawText: string): TargetRoleRecognitionResult["suggestedRole"] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const field = (labels: string[]) => {
    const pattern = new RegExp(`^(?:${labels.join("|")})\\s*[:：]\\s*(.+)$`, "i")
    return lines.map((line) => line.match(pattern)?.[1]?.trim()).find(Boolean) ?? null
  }
  const range = rawText.match(/(\d+)\s*[-–—至]\s*(\d+)\s*(?:years?|年)/i)
  const minimum = rawText.match(/(\d+)\s*(?:\+|年以上|years?\s+or\s+more)/i)
  return {
    title: field(["岗位名称", "职位", "job title", "role"]) ?? lines[0] ?? "",
    company: field(["公司名称", "公司", "company"]),
    recruitmentType: /校招|campus|graduate/i.test(rawText)
      ? "campus"
      : /社招|experienced|years? of experience/i.test(rawText)
        ? "experienced"
        : null,
    location: field(["工作地点", "地点", "location"]),
    experienceRange: range
      ? { minYears: Number(range[1]), maxYears: Number(range[2]) }
      : minimum
        ? { minYears: Number(minimum[1]), maxYears: null }
        : null,
  }
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
  if (role.status === "archived") {
    throw new Error("An archived target role cannot be current.")
  }

  return setMockResponse({
    ...mockResponse,
    currentRoleId: role.id,
  })
}

export async function archiveTargetRole(input: ArchiveTargetRoleInput): Promise<RolesPageResponse> {
  await waitForMockDelay()
  const role = requireRole(input.roleId)
  requireCurrentVersion(role, input.version)

  const archivedRole: TargetRole = {
    ...role,
    ...nextRoleVersion(role),
    status: "archived",
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
