import {
  createProfileMockSnapshot,
  profileResponseMock,
  type ProfileMockScenario,
} from "@/mocks/data/profile"
import { waitForMockDelay } from "@/mocks/utils"
import { normalizeSkillIds, normalizeSkillName } from "@/models/profile-text"
import type {
  JobProfile,
  JobProfileSnapshot,
  MatchingAnalysis,
  NewProfileSkillInput,
  ProfileSource,
  ResumeFile,
  ResumeRecognition,
  ResumeUpdate,
  ResumeUploadInput,
  SaveProfileSectionInput,
} from "@/models/profile"

function copy<T>(value: T): T {
  return structuredClone(value)
}

let mockSnapshot: JobProfileSnapshot = copy(profileResponseMock)
const retryableRecognitionFailures = new Set<string>()

export function resetProfileMockState(scenario: ProfileMockScenario = "complete") {
  mockSnapshot = createProfileMockSnapshot(scenario)
  retryableRecognitionFailures.clear()
}

export function getProfileMockSnapshot(): JobProfileSnapshot {
  return copy(mockSnapshot)
}

function standardProfile(): JobProfile {
  const profile = copy(profileResponseMock.profile)
  if (!profile) throw new Error("The standard profile fixture is invalid.")
  return profile
}

function requireProfile(profileId: string) {
  const profile = mockSnapshot.profile
  if (!profile || profile.profileId !== profileId) throw new Error("Job profile was not found.")
  return profile
}

function setMockSnapshot(snapshot: JobProfileSnapshot) {
  mockSnapshot = copy(snapshot)
  return copy(mockSnapshot)
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

function createEmptyProfile(resume: ResumeFile | null, status: JobProfile["status"]): JobProfile {
  const profile = standardProfile()
  return {
    ...profile,
    completeness: {
      percentage: 0,
      missingSections: [
        "education",
        "workExperience",
        "projectExperience",
        "skills",
        "credentials",
        "targetRoles",
      ],
    },
    credentials: [],
    education: [],
    matchingAnalysisStale: false,
    profileId: "profile_resume_import",
    projectExperiences: [],
    resume,
    skills: [],
    status,
    targetRoles: [],
    updatedAt: resume?.uploadedAt ?? "2026-07-13T08:00:00.000Z",
    version: 1,
    workExperiences: [],
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

function persistDraftSkills(profile: JobProfile, skillsToCreate: NewProfileSkillInput[]) {
  const idsByName = new Map(
    profile.skills.map((skill) => [normalizeSkillName(skill.name), skill.id]),
  )
  const persistedIds = new Map<string, string>()
  for (const draftSkill of skillsToCreate) {
    const name = draftSkill.name.trim().replace(/\s+/g, " ")
    const normalizedName = normalizeSkillName(name)
    if (!normalizedName) continue
    let id = idsByName.get(normalizedName)
    if (!id) {
      id = createSkillId(profile, name)
      profile.skills.push({ id, name, source: "userAdded" })
      idsByName.set(normalizedName, id)
    }
    persistedIds.set(draftSkill.clientId, id)
  }
  return persistedIds
}

function replaceDraftSkillIds(skillIds: string[], persistedIds: Map<string, string>) {
  return normalizeSkillIds(
    skillIds.map((id) => {
      const persistedId = persistedIds.get(id)
      if (id.startsWith("draft_skill_") && !persistedId) {
        throw new Error("A selected draft skill is missing from this save request.")
      }
      return persistedId ?? id
    }),
  )
}

function applySkillLinkedSectionSave(
  profile: JobProfile,
  input: Extract<SaveProfileSectionInput, { section: "workExperience" | "projectExperience" }>,
) {
  const persistedIds = persistDraftSkills(profile, input.skillsToCreate)
  if (input.section === "workExperience") {
    profile.workExperiences = applySources(
      profile.workExperiences,
      input.values.map((item) => ({
        ...item,
        skillIds: replaceDraftSkillIds(item.skillIds, persistedIds),
      })),
    )
    return
  }
  profile.projectExperiences = applySources(
    profile.projectExperiences,
    input.values.map((item) => ({
      ...item,
      skillIds: replaceDraftSkillIds(item.skillIds, persistedIds),
    })),
  )
}

function recognizedProfile(): JobProfile {
  const profile = standardProfile()
  return {
    ...profile,
    credentials: profile.credentials.map((item) => ({
      ...item,
      source: "resumeExtracted" as const,
    })),
    education: profile.education.map((item) => ({ ...item, source: "resumeExtracted" as const })),
    projectExperiences: profile.projectExperiences.map((item) => ({
      ...item,
      source: "resumeExtracted" as const,
    })),
    skills: [
      ...profile.skills.map((item) => ({ ...item, source: "resumeExtracted" as const })),
      { id: "skill_accessibility", name: "Accessibility", source: "resumeExtracted" as const },
    ],
    workExperiences: profile.workExperiences.map((item) => ({
      ...item,
      source: "resumeExtracted" as const,
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
    return !recognized || item.source !== "resumeExtracted"
      ? item
      : { ...recognized, source: "resumeExtracted" as const }
  })
  for (const recognized of recognizedItems) {
    if (!currentItems.some((item) => item.id === recognized.id)) {
      merged.push({ ...recognized, source: "resumeExtracted" })
    }
  }
  return merged
}

function mergeRecognizedProfile(profile: JobProfile): JobProfile {
  const recognized = recognizedProfile()
  return {
    ...profile,
    credentials: mergeRecognizedItems(profile.credentials, recognized.credentials),
    education: mergeRecognizedItems(profile.education, recognized.education),
    projectExperiences: mergeRecognizedItems(
      profile.projectExperiences,
      recognized.projectExperiences,
    ),
    skills: mergeRecognizedItems(profile.skills, recognized.skills),
    workExperiences: mergeRecognizedItems(profile.workExperiences, recognized.workExperiences),
  }
}

function staleMatchingAnalysis(
  matchingAnalysis: MatchingAnalysis | null,
  profile: JobProfile,
): MatchingAnalysis | null {
  if (!matchingAnalysis) return null
  if (matchingAnalysis.profileVersion >= profile.version) {
    throw new Error("A stale matching analysis must be older than the profile.")
  }
  return { ...matchingAnalysis, status: "stale" }
}

function recognitionFailureReason(resume: ResumeFile) {
  const fileName = resume.fileName.toLowerCase()
  if (fileName.includes("unreadable")) {
    return "The resume could not be recognized because its text layer is unavailable."
  }
  if (fileName.includes("retryable") && !retryableRecognitionFailures.has(resume.id)) {
    // Mock fixtures can model one transient backend failure before a retry succeeds.
    retryableRecognitionFailures.add(resume.id)
    return "The resume could not be recognized because the recognition service timed out."
  }
  return null
}

function completeInitialRecognition(profile: JobProfile, recognition: ResumeRecognition) {
  const failureReason = recognitionFailureReason(profile.resume!)
  if (failureReason) {
    const resume = { ...profile.resume!, failureReason, processingStatus: "failed" as const }
    const failedProfile = { ...profile, resume, status: "recognitionFailed" as const }
    return setMockSnapshot({
      ...mockSnapshot,
      profile: failedProfile,
      recognition: {
        ...recognition,
        completedAt: "2026-07-13T08:02:00.000Z",
        failureReason,
        processingStatus: "failed",
      },
    })
  }

  const parsedAt = "2026-07-13T08:02:00.000Z"
  const resume = { ...profile.resume!, parsedAt, processingStatus: "succeeded" as const }
  const completedProfile = mergeRecognizedProfile({
    ...profile,
    resume,
    status: "active",
    updatedAt: parsedAt,
    version: profile.version + 1,
  })
  return setMockSnapshot({
    matchingAnalysis: null,
    profile: completedProfile,
    recognition: { ...recognition, processingStatus: "succeeded", completedAt: parsedAt },
    resumeUpdate: null,
  })
}

function completeUpdatedRecognition(profile: JobProfile, resumeUpdate: ResumeUpdate) {
  const failureReason = recognitionFailureReason(resumeUpdate.resume)
  if (failureReason) {
    const failedUpdate = {
      ...resumeUpdate,
      failureReason,
      resume: { ...resumeUpdate.resume, failureReason, processingStatus: "failed" as const },
      status: "failed" as const,
    }
    return setMockSnapshot({
      ...mockSnapshot,
      profile: { ...profile, status: "active" },
      resumeUpdate: failedUpdate,
    })
  }

  const parsedAt = "2026-07-13T08:04:00.000Z"
  const resume = { ...resumeUpdate.resume, parsedAt, processingStatus: "succeeded" as const }
  const mergedProfile = mergeRecognizedProfile({
    ...profile,
    matchingAnalysisStale: false,
    resume,
    status: "active",
    updatedAt: parsedAt,
    version: profile.version + 1,
  })
  const matchingAnalysis = staleMatchingAnalysis(mockSnapshot.matchingAnalysis, mergedProfile)
  const completedProfile = { ...mergedProfile, matchingAnalysisStale: matchingAnalysis !== null }
  return setMockSnapshot({
    ...mockSnapshot,
    matchingAnalysis,
    profile: completedProfile,
    resumeUpdate: {
      ...resumeUpdate,
      changeSummary: { newItems: 1, changedItems: 2, missingItems: 1 },
      failureReason: null,
      resume,
      status: "succeeded",
    },
  })
}

export async function getJobProfile(): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  return copy(mockSnapshot)
}

export async function saveProfileSection(
  input: SaveProfileSectionInput,
): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  const profile = copy(requireProfile(input.profileId))
  if (profile.version !== input.version) throw new Error("Job profile version is out of date.")
  if (input.section === "workExperience" || input.section === "projectExperience") {
    applySkillLinkedSectionSave(profile, input)
  } else {
    applySavedSection(profile, input)
  }
  profile.updatedAt = "2026-07-13T08:05:00.000Z"
  profile.version += 1
  const matchingAnalysis = staleMatchingAnalysis(mockSnapshot.matchingAnalysis, profile)
  profile.matchingAnalysisStale = matchingAnalysis !== null
  return setMockSnapshot({ ...mockSnapshot, matchingAnalysis, profile })
}

export async function uploadInitialResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  const resume = createUploadedResume(input, "resume_uploaded_initial")
  if (mockSnapshot.profile) {
    throw new Error("An existing profile must use the resume update workflow.")
  }
  const profile = createEmptyProfile(resume, "uploadingResume")
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
  await waitForMockDelay()
  const profile = copy(requireProfile(profileId))
  if (profile.resume?.id !== resumeId) throw new Error("Resume was not found.")
  const recognition = mockSnapshot.recognition
  if (!recognition || recognition.resumeId !== resumeId)
    throw new Error("Resume recognition was not found.")
  if (recognition.processingStatus === "parsing" || recognition.processingStatus === "succeeded") {
    return copy(mockSnapshot)
  }
  if (recognition.processingStatus !== "uploaded" && recognition.processingStatus !== "failed") {
    return copy(mockSnapshot)
  }

  const resume = {
    ...profile.resume,
    failureReason: null,
    parsedAt: null,
    processingStatus: "parsing" as const,
  }
  return setMockSnapshot({
    ...mockSnapshot,
    profile: { ...profile, resume, status: "parsingResume" },
    recognition: {
      ...recognition,
      completedAt: null,
      failureReason: null,
      processingStatus: "parsing",
    },
  })
}

export async function getResumeRecognitionStatus(
  profileId: string,
  resumeId: string,
): Promise<ResumeRecognition> {
  await waitForMockDelay()
  const profile = requireProfile(profileId)
  const recognition = mockSnapshot.recognition
  if (!recognition || recognition.resumeId !== resumeId)
    throw new Error("Resume recognition was not found.")
  // Polling advances this mock job to simulate an asynchronous backend.
  if (recognition.processingStatus === "parsing") completeInitialRecognition(profile, recognition)
  return copy(mockSnapshot.recognition!)
}

export async function resetInitialResumeImport(
  profileId: string,
  _resumeId: string,
): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  requireProfile(profileId)
  return setMockSnapshot({
    profile: null,
    recognition: null,
    resumeUpdate: null,
    matchingAnalysis: null,
  })
}

export async function createManualJobProfile(): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  return setMockSnapshot({
    profile: createEmptyProfile(null, "active"),
    recognition: null,
    resumeUpdate: null,
    matchingAnalysis: null,
  })
}

export async function uploadUpdatedResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  const profile = copy(mockSnapshot.profile)
  if (!profile) throw new Error("Job profile was not found.")
  const resume = createUploadedResume(input, "resume_uploaded_update")
  return setMockSnapshot({
    ...mockSnapshot,
    profile,
    resumeUpdate: {
      id: "resume_update_uploaded",
      createdAt: resume.uploadedAt,
      status: "uploading",
      resume,
      changeSummary: null,
      failureReason: null,
      preservesManualChanges: true,
    },
  })
}

export async function startUpdatedResumeRecognition(
  profileId: string,
  resumeUpdateId: string,
): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  const profile = copy(requireProfile(profileId))
  const resumeUpdate = mockSnapshot.resumeUpdate
  if (!resumeUpdate || resumeUpdate.id !== resumeUpdateId)
    throw new Error("Resume update was not found.")
  if (resumeUpdate.status !== "uploading") return copy(mockSnapshot)
  const parsingResume = { ...resumeUpdate.resume, processingStatus: "parsing" as const }
  return setMockSnapshot({
    ...mockSnapshot,
    profile,
    resumeUpdate: { ...resumeUpdate, resume: parsingResume, status: "parsing" },
  })
}

export async function getResumeUpdateStatus(
  profileId: string,
  resumeUpdateId: string,
): Promise<ResumeUpdate> {
  await waitForMockDelay()
  const profile = requireProfile(profileId)
  const resumeUpdate = mockSnapshot.resumeUpdate
  if (!resumeUpdate || resumeUpdate.id !== resumeUpdateId)
    throw new Error("Resume update was not found.")
  // Polling advances this mock job to simulate an asynchronous backend.
  if (resumeUpdate.status === "parsing") completeUpdatedRecognition(profile, resumeUpdate)
  return copy(mockSnapshot.resumeUpdate!)
}

export async function regenerateMatchingAnalysis(profileId: string): Promise<MatchingAnalysis> {
  await waitForMockDelay()
  const profile = copy(requireProfile(profileId))
  profile.matchingAnalysisStale = false
  const matchingAnalysis: MatchingAnalysis = {
    status: "current",
    profileVersion: profile.version,
    generatedAt: "2026-07-13T08:20:00.000Z",
    failureReason: null,
  }
  setMockSnapshot({ ...mockSnapshot, matchingAnalysis, profile })
  return copy(matchingAnalysis)
}
