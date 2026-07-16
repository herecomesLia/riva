import { env } from "@/app/env"
import { profileResponseMock } from "@/mocks/data/profile"
import { waitForMockDelay } from "@/mocks/utils"
import { normalizeSkillIds, normalizeSkillName } from "@/models/profile-text"
import type {
  JobProfile,
  JobProfileSnapshot,
  MatchingAnalysis,
  ProfileSource,
  ResumeFile,
  ResumeRecognition,
  ResumeUpdate,
  ResumeUploadInput,
  SaveProfileSectionInput,
  SaveWorkExperienceSectionInput,
} from "@/models/profile"

function copy<T>(value: T): T {
  return structuredClone(value)
}

let mockSnapshot: JobProfileSnapshot = copy(profileResponseMock)

export function resetProfileMockState() {
  mockSnapshot = copy(profileResponseMock)
}

async function waitForProfileMock() {
  await waitForMockDelay()
}

function requireMock() {
  if (!env.mock) {
    throw new Error("Real job profile API is not implemented.")
  }
}

function standardProfile(): JobProfile {
  const profile = copy(profileResponseMock.profile)
  if (!profile) throw new Error("The standard profile fixture is invalid.")
  return profile
}

function requireProfile(profileId: string) {
  const profile = mockSnapshot.profile
  if (!profile || profile.profileId !== profileId) {
    throw new Error("Job profile was not found.")
  }

  return profile
}

function setMockSnapshot(snapshot: JobProfileSnapshot) {
  mockSnapshot = copy(snapshot)
  return copy(mockSnapshot)
}

function setProfile(profile: JobProfile) {
  return setMockSnapshot({ ...mockSnapshot, profile })
}

function createUploadedResume(input: ResumeUploadInput, id: string): ResumeFile {
  const file = input.file
  const text = input.text?.trim()
  if (!file && !text) throw new Error("A resume file or pasted resume text is required.")

  return {
    id,
    fileName: file?.name ?? "pasted-resume.txt",
    mimeType: file?.type || "text/plain",
    fileSize: file?.size ?? new Blob([text ?? ""]).size,
    uploadedAt: "2026-07-13T08:00:00.000Z",
    parsedAt: null,
    processingStatus: "uploaded",
    failureReason: null,
  }
}

function removeSource<T extends { source?: ProfileSource }>(item: T) {
  const { source: _source, ...businessFields } = item
  return businessFields
}

function applySources<T extends { id: string; source?: ProfileSource }>(
  currentItems: Array<T & { source: ProfileSource }>,
  submittedItems: T[],
) {
  const currentById = new Map(currentItems.map((item) => [item.id, item]))

  return submittedItems.map((submittedItem) => {
    const currentItem = currentById.get(submittedItem.id)
    const businessFields = removeSource(submittedItem)

    if (!currentItem || submittedItem.id.startsWith("draft_")) {
      return { ...businessFields, source: "userAdded" as const }
    }

    const source: ProfileSource =
      JSON.stringify(removeSource(currentItem)) === JSON.stringify(businessFields)
        ? currentItem.source
        : "userEdited"

    return { ...businessFields, source }
  })
}

function applySavedSection(profile: JobProfile, input: SaveProfileSectionInput) {
  switch (input.section) {
    case "education":
      profile.education = applySources(profile.education, input.values)
      break
    case "workExperience":
      profile.workExperiences = applySources(profile.workExperiences, input.values)
      break
    case "projectExperience":
      profile.projectExperiences = applySources(profile.projectExperiences, input.values)
      break
    case "skills":
      profile.skills = applySources(profile.skills, input.values)
      break
    case "credentials":
      profile.credentials = applySources(profile.credentials, input.values)
      break
    case "targetRoles":
      profile.targetRoles = applySources(profile.targetRoles, input.values)
  }
}

function createSkillId(profile: JobProfile, name: string) {
  const base = `skill_${
    normalizeSkillName(name)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "custom"
  }`
  let id = base
  let suffix = 2

  while (profile.skills.some((skill) => skill.id === id)) {
    id = `${base}_${suffix}`
    suffix += 1
  }

  return id
}

function applyWorkExperienceSave(profile: JobProfile, input: SaveWorkExperienceSectionInput) {
  const skillIdsByName = new Map(
    profile.skills.map((skill) => [normalizeSkillName(skill.name), skill.id]),
  )
  const persistedIdsByClientId = new Map<string, string>()

  for (const draftSkill of input.skillsToCreate) {
    const name = draftSkill.name.trim().replace(/\s+/g, " ")
    const normalizedName = normalizeSkillName(name)
    if (!normalizedName) continue

    let persistedId = skillIdsByName.get(normalizedName)
    if (!persistedId) {
      persistedId = createSkillId(profile, name)
      profile.skills.push({ id: persistedId, name, source: "userAdded" })
      skillIdsByName.set(normalizedName, persistedId)
    }
    persistedIdsByClientId.set(draftSkill.clientId, persistedId)
  }

  const values = input.values.map((experience) => {
    const skillIds = experience.skillIds.map((id) => {
      const persistedId = persistedIdsByClientId.get(id)
      if (id.startsWith("draft_skill_") && !persistedId) {
        throw new Error("A selected draft skill is missing from this save request.")
      }
      return persistedId ?? id
    })

    return { ...experience, skillIds: normalizeSkillIds(skillIds) }
  })
  profile.workExperiences = applySources(profile.workExperiences, values)
}

function withResumeExtractedSource(profile: JobProfile): JobProfile {
  return {
    ...profile,
    credentials: profile.credentials.map((item) => ({ ...item, source: "resumeExtracted" })),
    education: profile.education.map((item) => ({ ...item, source: "resumeExtracted" })),
    projectExperiences: profile.projectExperiences.map((item) => ({
      ...item,
      source: "resumeExtracted",
    })),
    skills: profile.skills.map((item) => ({ ...item, source: "resumeExtracted" })),
    workExperiences: profile.workExperiences.map((item) => ({
      ...item,
      source: "resumeExtracted",
    })),
  }
}

function mergeRecognizedItems<T extends { id: string; source: ProfileSource }>(
  currentItems: T[],
  recognizedItems: T[],
) {
  const recognizedById = new Map(recognizedItems.map((item) => [item.id, item]))
  const merged = currentItems.map((item) => {
    const recognized = recognizedById.get(item.id)

    if (!recognized || item.source !== "resumeExtracted") {
      return item
    }

    return { ...recognized, source: "resumeExtracted" as const }
  })

  for (const recognized of recognizedItems) {
    if (!currentItems.some((item) => item.id === recognized.id)) {
      merged.push({ ...recognized, source: "resumeExtracted" })
    }
  }

  return merged
}

function mergeRecognizedProfile(profile: JobProfile): JobProfile {
  const recognized = withResumeExtractedSource(standardProfile())
  const additionalSkill = {
    id: "skill_accessibility",
    name: "Accessibility",
    source: "resumeExtracted" as const,
  }

  return {
    ...profile,
    credentials: mergeRecognizedItems(profile.credentials, recognized.credentials),
    education: mergeRecognizedItems(profile.education, recognized.education),
    projectExperiences: mergeRecognizedItems(
      profile.projectExperiences,
      recognized.projectExperiences,
    ),
    skills: mergeRecognizedItems(profile.skills, [...recognized.skills, additionalSkill]),
    workExperiences: mergeRecognizedItems(profile.workExperiences, recognized.workExperiences),
  }
}

export async function getJobProfile(): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  return copy(mockSnapshot)
}

export async function saveProfileSection(input: SaveProfileSectionInput): Promise<JobProfile> {
  requireMock()
  await waitForProfileMock()
  const profile = copy(requireProfile(input.profileId))
  if (profile.version !== input.version) throw new Error("Job profile version is out of date.")

  if (input.section === "workExperience") {
    applyWorkExperienceSave(profile, input)
  } else {
    applySavedSection(profile, input)
  }
  profile.updatedAt = "2026-07-13T08:05:00.000Z"
  profile.version += 1
  profile.matchingAnalysisStale = true
  setProfile(profile)
  return copy(profile)
}

export async function uploadInitialResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  const resume = createUploadedResume(input, "resume_uploaded_initial")
  const existingProfile = mockSnapshot.profile
  const profile = copy(existingProfile ?? withResumeExtractedSource(standardProfile()))

  profile.status = "uploadingResume"
  profile.resume = resume
  profile.updatedAt = resume.uploadedAt

  return setMockSnapshot({
    matchingAnalysis: null,
    profile,
    recognition: {
      resumeId: resume.id,
      processingStatus: "uploaded",
      completedAt: null,
      failureReason: null,
    },
    resumeUpdate: null,
  })
}

export async function startInitialResumeRecognition(
  profileId: string,
  resumeId: string,
): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  const uploadingProfile = copy(requireProfile(profileId))
  if (uploadingProfile.resume?.id !== resumeId) throw new Error("Resume was not found.")

  const parsedAt = "2026-07-13T08:02:00.000Z"
  const profile = mergeRecognizedProfile(uploadingProfile)
  profile.status = "active"
  profile.resume = {
    ...uploadingProfile.resume,
    parsedAt,
    processingStatus: "succeeded",
  }
  profile.updatedAt = parsedAt
  profile.version += 1
  profile.matchingAnalysisStale = false

  return setMockSnapshot({
    matchingAnalysis: null,
    profile,
    recognition: {
      resumeId,
      processingStatus: "succeeded",
      completedAt: parsedAt,
      failureReason: null,
    },
    resumeUpdate: null,
  })
}

export async function resetInitialResumeImport(
  profileId: string,
  _resumeId: string,
): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  requireProfile(profileId)
  return setMockSnapshot({
    matchingAnalysis: null,
    profile: null,
    recognition: null,
    resumeUpdate: null,
  })
}

export async function createManualJobProfile(): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  const profile = standardProfile()
  profile.resume = null
  profile.status = "active"
  profile.education = []
  profile.workExperiences = []
  profile.projectExperiences = []
  profile.skills = []
  profile.credentials = []
  profile.targetRoles = []
  profile.completeness = {
    percentage: 0,
    missingSections: ["education", "workExperience", "projectExperience", "skills", "credentials"],
  }
  profile.matchingAnalysisStale = false
  return setMockSnapshot({ profile, recognition: null, resumeUpdate: null, matchingAnalysis: null })
}

export async function getResumeRecognitionStatus(
  profileId: string,
  resumeId: string,
): Promise<ResumeRecognition> {
  requireMock()
  await waitForProfileMock()
  requireProfile(profileId)
  const recognition = mockSnapshot.recognition
  if (!recognition || recognition.resumeId !== resumeId)
    throw new Error("Resume recognition was not found.")
  return copy(recognition)
}

export async function uploadUpdatedResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  const profile = copy(mockSnapshot.profile)
  if (!profile) throw new Error("Job profile was not found.")

  const resume = createUploadedResume(input, "resume_uploaded_update")
  const resumeUpdate: ResumeUpdate = {
    id: "resume_update_uploaded",
    createdAt: resume.uploadedAt,
    status: "uploading",
    resume,
    changeSummary: null,
    failureReason: null,
    preservesManualChanges: true,
  }

  return setMockSnapshot({ ...mockSnapshot, profile, resumeUpdate })
}

export async function startUpdatedResumeRecognition(
  profileId: string,
  resumeUpdateId: string,
): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  const currentProfile = copy(requireProfile(profileId))
  const currentResumeUpdate = mockSnapshot.resumeUpdate
  if (!currentResumeUpdate || currentResumeUpdate.id !== resumeUpdateId) {
    throw new Error("Resume update was not found.")
  }

  const parsedAt = "2026-07-13T08:04:00.000Z"
  const profile = mergeRecognizedProfile(currentProfile)
  profile.status = "active"
  profile.resume = {
    ...currentResumeUpdate.resume,
    parsedAt,
    processingStatus: "succeeded",
  }
  profile.updatedAt = parsedAt
  profile.version += 1
  profile.matchingAnalysisStale = true

  return setMockSnapshot({
    ...mockSnapshot,
    profile,
    resumeUpdate: {
      ...currentResumeUpdate,
      changeSummary: { newItems: 1, changedItems: 2, missingItems: 1 },
      resume: profile.resume,
      status: "succeeded",
    },
  })
}

export async function regenerateMatchingAnalysis(profileId: string): Promise<MatchingAnalysis> {
  requireMock()
  await waitForProfileMock()
  const profile = requireProfile(profileId)
  return {
    status: "current",
    profileVersion: profile.version,
    generatedAt: "2026-07-13T08:20:00.000Z",
    failureReason: null,
  }
}
