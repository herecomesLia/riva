import { env } from "@/app/env"
import * as profileMockService from "@/mocks/services/profile"
import type {
  CareerProfileDto,
  CareerProfileEducationInputDto,
  CareerProfileProjectExperienceInputDto,
  CareerProfilePutRequestDto,
  CareerProfileSkillInputDto,
  CareerProfileWorkExperienceInputDto,
  EducationExperience,
  JobProfile,
  JobProfileSnapshot,
  MatchingAnalysis,
  NewProfileSkillInput,
  ProfileCapabilities,
  ProfileSection,
  ProfileSkill,
  ProjectExperience,
  ResumeDocument,
  ResumeImportApplication,
  ResumeImportDraft,
  ResumeParsingStatus,
  ResumeFile,
  ResumeRecognition,
  ResumeUpdate,
  ResumeUploadInput,
  SaveProfileSectionInput,
  WorkExperience,
} from "@/models/profile"
import {
  careerProfileGetResponseSchema,
  careerProfilePutResponseSchema,
  resumeDocumentSchema,
  resumeImportApplicationSchema,
  resumeImportDraftSchema,
  resumeParsingStatusSchema,
} from "@/schemas/profile"
import { apiRequest, ApiError } from "@/services/api"

const allProfileCapabilities: ProfileCapabilities = {
  credentials: true,
  matchingAnalysis: true,
  resumeImport: true,
  resumeRecognition: true,
  resumeUpdate: true,
  targetRoles: true,
}

const careerProfileApiCapabilities: ProfileCapabilities = {
  credentials: false,
  matchingAnalysis: false,
  resumeImport: false,
  resumeRecognition: false,
  resumeUpdate: false,
  targetRoles: false,
}

export const profileCapabilities = env.mock ? allProfileCapabilities : careerProfileApiCapabilities

const standardUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function realApiUnavailable(feature: string): never {
  throw new Error(`${feature} is not supported by the CareerProfile API.`)
}

function createResumeUploadFormData(input: ResumeUploadInput): FormData {
  const hasFile = input.file !== undefined
  const hasText = input.text !== undefined

  if (hasFile === hasText) {
    throw new TypeError("Exactly one of file or text is required for a resume upload.")
  }
  if (input.text !== undefined && !input.text.trim()) {
    throw new TypeError("Resume text must not be empty.")
  }

  const formData = new FormData()
  if (input.file !== undefined) {
    formData.append("file", input.file)
  } else if (input.text !== undefined) {
    formData.append("text", input.text)
  }

  return formData
}

function mapMockResumeDocument(resume: ResumeFile): ResumeDocument {
  const extractionStatus =
    resume.processingStatus === "succeeded"
      ? "succeeded"
      : resume.processingStatus === "failed"
        ? "failed"
        : "pending"

  return {
    byteSize: resume.fileSize,
    extractedAt: resume.parsedAt,
    extractionStatus,
    failureReason: resume.failureReason,
    id: resume.id,
    mediaType: resume.mimeType,
    originalFilename: resume.fileName === "pasted-resume.txt" ? null : resume.fileName,
    sourceType: resume.fileName === "pasted-resume.txt" ? "pastedText" : "file",
    uploadedAt: resume.uploadedAt,
  }
}

function mapMockParsingStatus(
  resumeId: string,
  processingStatus: ResumeFile["processingStatus"],
  failureReason: string | null,
): ResumeParsingStatus {
  const runId = "00000000-0000-4000-8000-000000000001"
  const createdAt = "2026-07-13T08:00:00.000Z"
  const finishedAt = "2026-07-13T08:02:00.000Z"

  if (processingStatus === "uploaded") {
    return {
      attemptCount: 0,
      canRetry: false,
      createdAt: null,
      draftStatus: null,
      draftVersion: null,
      errorCode: null,
      failureReason: null,
      finishedAt: null,
      maxAttempts: null,
      resultVersion: null,
      resumeDocumentId: resumeId,
      runId: null,
      startedAt: null,
      status: "notStarted",
    }
  }

  if (processingStatus === "parsing") {
    return {
      attemptCount: 1,
      canRetry: false,
      createdAt,
      draftStatus: null,
      draftVersion: null,
      errorCode: null,
      failureReason: null,
      finishedAt: null,
      maxAttempts: 3,
      resultVersion: null,
      resumeDocumentId: resumeId,
      runId,
      startedAt: createdAt,
      status: "running",
    }
  }

  if (processingStatus === "succeeded") {
    return {
      attemptCount: 1,
      canRetry: false,
      createdAt,
      draftStatus: "ready",
      draftVersion: 1,
      errorCode: null,
      failureReason: null,
      finishedAt,
      maxAttempts: 3,
      resultVersion: 1,
      resumeDocumentId: resumeId,
      runId,
      startedAt: createdAt,
      status: "succeeded",
    }
  }

  return {
    attemptCount: 1,
    canRetry: true,
    createdAt,
    draftStatus: null,
    draftVersion: null,
    errorCode: "resume_parsing_unavailable",
    failureReason: failureReason ?? "Resume parsing failed.",
    finishedAt,
    maxAttempts: 3,
    resultVersion: null,
    resumeDocumentId: resumeId,
    runId,
    startedAt: createdAt,
    status: "failed",
  }
}

function getMockResumeContext(resumeId: string) {
  const snapshot = profileMockService.getProfileMockSnapshot()
  const profile = snapshot.profile
  if (!profile) {
    throw new Error("Job profile was not found.")
  }

  if (profile.resume?.id === resumeId) {
    return { kind: "initial" as const, profileId: profile.profileId }
  }

  if (snapshot.resumeUpdate?.resume.id === resumeId) {
    return {
      kind: "update" as const,
      profileId: profile.profileId,
      resumeUpdateId: snapshot.resumeUpdate.id,
    }
  }

  throw new Error("Resume was not found.")
}

function getMockParsingStatusFromSnapshot(
  resumeId: string,
  snapshot: JobProfileSnapshot,
): ResumeParsingStatus {
  if (snapshot.recognition?.resumeId === resumeId) {
    return mapMockParsingStatus(
      resumeId,
      snapshot.recognition.processingStatus,
      snapshot.recognition.failureReason,
    )
  }

  if (snapshot.resumeUpdate?.resume.id === resumeId) {
    return mapMockParsingStatus(
      resumeId,
      snapshot.resumeUpdate.resume.processingStatus,
      snapshot.resumeUpdate.failureReason,
    )
  }

  throw new Error("Resume parsing was not found.")
}

function requireStandardUuid(id: string): string {
  if (!standardUuidPattern.test(id)) {
    throw new TypeError(`Profile item id "${id}" is not a standard UUID.`)
  }

  return id
}

function mapClientId(id: string): string {
  if (id.startsWith("draft_skill_")) {
    return requireStandardUuid(id.slice("draft_skill_".length))
  }

  if (id.startsWith("draft_")) {
    return requireStandardUuid(id.slice("draft_".length))
  }

  return requireStandardUuid(id)
}

function mapSkillIds(skillIds: string[], idsByClientId: ReadonlyMap<string, string>): string[] {
  return [...new Set(skillIds.map((id) => idsByClientId.get(id) ?? mapClientId(id)))]
}

function requireStartDate(startDate: string | null): string {
  if (startDate === null) {
    throw new TypeError("Profile experience startDate is required.")
  }

  return startDate
}

function toEducationInput(item: EducationExperience): CareerProfileEducationInputDto {
  const { source: _source, ...input } = item

  return {
    ...input,
    id: mapClientId(input.id),
    startDate: requireStartDate(input.startDate),
  }
}

function toWorkExperienceInput(
  item: WorkExperience,
  idsByClientId: ReadonlyMap<string, string>,
): CareerProfileWorkExperienceInputDto {
  const { source: _source, ...input } = item

  return {
    ...input,
    id: mapClientId(input.id),
    skillIds: mapSkillIds(input.skillIds, idsByClientId),
    startDate: requireStartDate(input.startDate),
  }
}

function toProjectExperienceInput(
  item: ProjectExperience,
  idsByClientId: ReadonlyMap<string, string>,
): CareerProfileProjectExperienceInputDto {
  const { source: _source, ...input } = item

  return {
    ...input,
    id: mapClientId(input.id),
    skillIds: mapSkillIds(input.skillIds, idsByClientId),
    startDate: requireStartDate(input.startDate),
  }
}

function toSkillInput(item: ProfileSkill): CareerProfileSkillInputDto {
  const { source: _source, ...input } = item

  return { ...input, id: mapClientId(input.id) }
}

function toPutRequest(profile: CareerProfileDto): CareerProfilePutRequestDto {
  return {
    education: profile.education.map(toEducationInput),
    projectExperiences: profile.projectExperiences.map((item) =>
      toProjectExperienceInput(item, new Map()),
    ),
    skills: profile.skills.map(toSkillInput),
    summary: profile.summary,
    version: profile.version,
    workExperiences: profile.workExperiences.map((item) => toWorkExperienceInput(item, new Map())),
  }
}

function deriveCompleteness(profile: CareerProfileDto): JobProfile["completeness"] {
  const supportedSections: Array<[ProfileSection, boolean]> = [
    ["education", profile.education.length > 0],
    ["workExperience", profile.workExperiences.length > 0],
    ["projectExperience", profile.projectExperiences.length > 0],
    ["skills", profile.skills.length > 0],
  ]
  const missingSections = supportedSections
    .filter(([, complete]) => !complete)
    .map(([section]) => section)

  return {
    missingSections,
    percentage: Math.round(
      ((supportedSections.length - missingSections.length) / supportedSections.length) * 100,
    ),
  }
}

function toSnapshot(profile: CareerProfileDto | null): JobProfileSnapshot {
  return {
    matchingAnalysis: null,
    profile:
      profile === null
        ? null
        : {
            ...profile,
            completeness: deriveCompleteness(profile),
            credentials: [],
            matchingAnalysisStale: false,
            resume: null,
            status: "active",
            targetRoles: [],
          },
    recognition: null,
    resumeUpdate: null,
  }
}

async function getCareerProfile(): Promise<CareerProfileDto | null> {
  const response = careerProfileGetResponseSchema.parse(await apiRequest<unknown>("/profile"))

  return response.profile
}

async function putCareerProfile(request: CareerProfilePutRequestDto): Promise<JobProfileSnapshot> {
  const response = careerProfilePutResponseSchema.parse(
    await apiRequest<unknown>("/profile", {
      json: request,
      method: "PUT",
    }),
  )

  return toSnapshot(response.profile)
}

function resumeApiPath(resumeId: string, suffix = ""): string {
  return `/profile/resumes/${encodeURIComponent(resumeId)}${suffix}`
}

function resumeImportMockUnavailable(feature: string): never {
  throw new Error(`${feature} is not available in the existing profile mock.`)
}

export async function uploadResume(input: ResumeUploadInput): Promise<ResumeDocument> {
  const formData = createResumeUploadFormData(input)

  if (!env.mock) {
    return resumeDocumentSchema.parse(
      await apiRequest<unknown>("/profile/resumes", {
        body: formData,
        method: "POST",
      }),
    )
  }

  const current = profileMockService.getProfileMockSnapshot()
  const snapshot = current.profile
    ? await profileMockService.uploadUpdatedResume(input)
    : await profileMockService.uploadInitialResume(input)
  const resume = snapshot.resumeUpdate?.resume ?? snapshot.profile?.resume
  if (!resume) {
    throw new Error("The mock resume upload did not return a resume document.")
  }

  return mapMockResumeDocument(resume)
}

export async function startResumeParsing(resumeId: string): Promise<ResumeParsingStatus> {
  if (!env.mock) {
    return resumeParsingStatusSchema.parse(
      await apiRequest<unknown>(`${resumeApiPath(resumeId)}/parsing`, {
        method: "POST",
      }),
    )
  }

  const context = getMockResumeContext(resumeId)
  const snapshot =
    context.kind === "initial"
      ? await profileMockService.startInitialResumeRecognition(context.profileId, resumeId)
      : await profileMockService.startUpdatedResumeRecognition(
          context.profileId,
          context.resumeUpdateId,
        )

  return getMockParsingStatusFromSnapshot(resumeId, snapshot)
}

export async function getResumeParsingStatus(resumeId: string): Promise<ResumeParsingStatus> {
  if (!env.mock) {
    return resumeParsingStatusSchema.parse(
      await apiRequest<unknown>(`${resumeApiPath(resumeId)}/parsing`),
    )
  }

  const context = getMockResumeContext(resumeId)
  if (context.kind === "initial") {
    const recognition = await profileMockService.getResumeRecognitionStatus(
      context.profileId,
      resumeId,
    )
    return mapMockParsingStatus(resumeId, recognition.processingStatus, recognition.failureReason)
  }

  const resumeUpdate = await profileMockService.getResumeUpdateStatus(
    context.profileId,
    context.resumeUpdateId,
  )
  return mapMockParsingStatus(
    resumeId,
    resumeUpdate.resume.processingStatus,
    resumeUpdate.failureReason,
  )
}

export async function retryResumeParsing(resumeId: string): Promise<ResumeParsingStatus> {
  if (!env.mock) {
    return resumeParsingStatusSchema.parse(
      await apiRequest<unknown>(`${resumeApiPath(resumeId)}/parsing/retry`, {
        method: "POST",
      }),
    )
  }

  const context = getMockResumeContext(resumeId)
  const snapshot =
    context.kind === "initial"
      ? await profileMockService.startInitialResumeRecognition(context.profileId, resumeId)
      : await profileMockService.startUpdatedResumeRecognition(
          context.profileId,
          context.resumeUpdateId,
        )

  return getMockParsingStatusFromSnapshot(resumeId, snapshot)
}

export async function getResumeImportDraft(resumeId: string): Promise<ResumeImportDraft> {
  if (env.mock) {
    return resumeImportMockUnavailable(`Resume import draft ${resumeId}`)
  }

  return resumeImportDraftSchema.parse(
    await apiRequest<unknown>(`${resumeApiPath(resumeId)}/import-draft`),
  )
}

export async function applyResumeImportDraft(
  resumeId: string,
  draftVersion: number,
): Promise<ResumeImportApplication> {
  if (env.mock) {
    return resumeImportMockUnavailable(`Resume import application ${resumeId}`)
  }

  return resumeImportApplicationSchema.parse(
    await apiRequest<unknown>(`${resumeApiPath(resumeId)}/import-draft/apply`, {
      json: { draftVersion },
      method: "POST",
    }),
  )
}

function createDraftSkillIdMap(skillsToCreate: NewProfileSkillInput[]) {
  return new Map(skillsToCreate.map((skill) => [skill.clientId, mapClientId(skill.clientId)]))
}

function appendDraftSkills(
  skills: CareerProfileSkillInputDto[],
  skillsToCreate: NewProfileSkillInput[],
  idsByClientId: ReadonlyMap<string, string>,
) {
  const existingIds = new Set(skills.map((skill) => skill.id))

  for (const skill of skillsToCreate) {
    const id = idsByClientId.get(skill.clientId)
    if (!id) {
      throw new TypeError(`Draft skill "${skill.clientId}" has no UUID mapping.`)
    }
    if (!existingIds.has(id)) {
      skills.push({ id, name: skill.name })
      existingIds.add(id)
    }
  }
}

function synchronizeSkillReferences(request: CareerProfilePutRequestDto) {
  const skillIds = new Set(request.skills.map((skill) => skill.id))

  for (const experience of [...request.workExperiences, ...request.projectExperiences]) {
    experience.skillIds = experience.skillIds.filter((id) => skillIds.has(id))
  }
}

export async function getJobProfile(): Promise<JobProfileSnapshot> {
  if (env.mock) {
    return profileMockService.getJobProfile()
  }

  return toSnapshot(await getCareerProfile())
}

export async function saveProfileSection(
  input: SaveProfileSectionInput,
): Promise<JobProfileSnapshot> {
  if (env.mock) {
    return profileMockService.saveProfileSection(input)
  }

  if (input.section === "credentials" || input.section === "targetRoles") {
    return realApiUnavailable(`The ${input.section} profile section`)
  }

  const current = await getCareerProfile()
  if (!current || current.profileId !== input.profileId) {
    throw new Error("Career profile was not found.")
  }
  if (current.version !== input.version) {
    const body = { error: "profile_version_conflict" }
    throw new ApiError(409, body.error, body)
  }

  const request = toPutRequest(current)

  switch (input.section) {
    case "education":
      request.education = input.values.map(toEducationInput)
      break
    case "skills":
      request.skills = input.values.map(toSkillInput)
      synchronizeSkillReferences(request)
      break
    case "workExperience": {
      const idsByClientId = createDraftSkillIdMap(input.skillsToCreate)
      appendDraftSkills(request.skills, input.skillsToCreate, idsByClientId)
      request.workExperiences = input.values.map((item) =>
        toWorkExperienceInput(item, idsByClientId),
      )
      break
    }
    case "projectExperience": {
      const idsByClientId = createDraftSkillIdMap(input.skillsToCreate)
      appendDraftSkills(request.skills, input.skillsToCreate, idsByClientId)
      request.projectExperiences = input.values.map((item) =>
        toProjectExperienceInput(item, idsByClientId),
      )
    }
  }

  return putCareerProfile(request)
}

export function uploadInitialResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  return env.mock
    ? profileMockService.uploadInitialResume(input)
    : realApiUnavailable("Resume upload")
}

export function startInitialResumeRecognition(
  profileId: string,
  resumeId: string,
): Promise<JobProfileSnapshot> {
  return env.mock
    ? profileMockService.startInitialResumeRecognition(profileId, resumeId)
    : realApiUnavailable("Resume recognition")
}

export function resetInitialResumeImport(
  profileId: string,
  resumeId: string,
): Promise<JobProfileSnapshot> {
  return env.mock
    ? profileMockService.resetInitialResumeImport(profileId, resumeId)
    : realApiUnavailable("Resume import reset")
}

export async function createManualJobProfile(): Promise<JobProfileSnapshot> {
  if (env.mock) {
    return profileMockService.createManualJobProfile()
  }

  return putCareerProfile({
    education: [],
    projectExperiences: [],
    skills: [],
    summary: null,
    version: null,
    workExperiences: [],
  })
}

export function getResumeRecognitionStatus(
  profileId: string,
  resumeId: string,
): Promise<ResumeRecognition> {
  return env.mock
    ? profileMockService.getResumeRecognitionStatus(profileId, resumeId)
    : realApiUnavailable("Resume recognition status")
}

export function uploadUpdatedResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  return env.mock
    ? profileMockService.uploadUpdatedResume(input)
    : realApiUnavailable("Resume update")
}

export function startUpdatedResumeRecognition(
  profileId: string,
  resumeUpdateId: string,
): Promise<JobProfileSnapshot> {
  return env.mock
    ? profileMockService.startUpdatedResumeRecognition(profileId, resumeUpdateId)
    : realApiUnavailable("Resume update recognition")
}

export function getResumeUpdateStatus(
  profileId: string,
  resumeUpdateId: string,
): Promise<ResumeUpdate> {
  return env.mock
    ? profileMockService.getResumeUpdateStatus(profileId, resumeUpdateId)
    : realApiUnavailable("Resume update status")
}

export function regenerateMatchingAnalysis(profileId: string): Promise<MatchingAnalysis> {
  return env.mock
    ? profileMockService.regenerateMatchingAnalysis(profileId)
    : realApiUnavailable("Matching analysis")
}
