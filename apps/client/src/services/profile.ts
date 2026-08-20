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
  NewProfileSkillInput,
  ProfileCapabilities,
  ProfileSection,
  ProfileSkill,
  ProjectExperience,
  ResumeDocument,
  ResumeImportApplication,
  ResumeImportDraft,
  ResumeParsingStatus,
  ResumeUploadInput,
  SaveProfileSectionInput,
  WorkExperience,
} from "@/models/profile"
import {
  careerProfileGetResponseSchema,
  careerProfilePutResponseSchema,
  resumeDocumentSchema,
  resumeDocumentsResponseSchema,
  resumeImportApplicationSchema,
  resumeImportDraftSchema,
  resumeParsingStatusSchema,
} from "@/schemas/profile"
import { apiRequest, ApiError } from "@/services/api"

const allProfileCapabilities: ProfileCapabilities = {
  credentials: true,
  resumeImport: true,
  targetRoles: true,
}

const careerProfileApiCapabilities: ProfileCapabilities = {
  credentials: false,
  resumeImport: true,
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
    profile:
      profile === null
        ? null
        : {
            ...profile,
            completeness: deriveCompleteness(profile),
            credentials: [],
            resume: null,
            status: "active",
            targetRoles: [],
          },
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

export async function listResumeDocuments(limit = 20): Promise<ResumeDocument[]> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new TypeError("Resume document limit must be a positive integer.")
  }

  const response = !env.mock
    ? await apiRequest<unknown>(`/profile/resumes?limit=${limit}`)
    : { documents: await profileMockService.listResumeDocuments(limit) }

  return resumeDocumentsResponseSchema.parse(response).documents
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

  return resumeDocumentSchema.parse(await profileMockService.uploadResume(input))
}

export async function startResumeParsing(resumeId: string): Promise<ResumeParsingStatus> {
  if (!env.mock) {
    return resumeParsingStatusSchema.parse(
      await apiRequest<unknown>(`${resumeApiPath(resumeId)}/parsing`, {
        method: "POST",
      }),
    )
  }

  return resumeParsingStatusSchema.parse(await profileMockService.startResumeParsing(resumeId))
}

export async function getResumeParsingStatus(resumeId: string): Promise<ResumeParsingStatus> {
  if (!env.mock) {
    return resumeParsingStatusSchema.parse(
      await apiRequest<unknown>(`${resumeApiPath(resumeId)}/parsing`),
    )
  }

  return resumeParsingStatusSchema.parse(await profileMockService.getResumeParsingStatus(resumeId))
}

export async function retryResumeParsing(resumeId: string): Promise<ResumeParsingStatus> {
  if (!env.mock) {
    return resumeParsingStatusSchema.parse(
      await apiRequest<unknown>(`${resumeApiPath(resumeId)}/parsing/retry`, {
        method: "POST",
      }),
    )
  }

  return resumeParsingStatusSchema.parse(await profileMockService.retryResumeParsing(resumeId))
}

export async function getResumeImportDraft(resumeId: string): Promise<ResumeImportDraft> {
  if (env.mock) {
    return resumeImportDraftSchema.parse(await profileMockService.getResumeImportDraft(resumeId))
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
    return resumeImportApplicationSchema.parse(
      await profileMockService.applyResumeImportDraft(resumeId, draftVersion),
    )
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
