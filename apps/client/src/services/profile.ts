import { env } from "@/app/env"
import { createProfileMockSnapshot, type ProfileMockScenario } from "@/mocks/data/profile"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  JobProfile,
  JobProfileSnapshot,
  ResumeFile,
  ResumeRecognition,
  ResumeRecognitionConfirmationInput,
  ResumeUpdateDecisionInput,
  ResumeUploadInput,
  SaveProfileSectionInput,
} from "@/models/profile"

const profileMockDelayMs = 500

let activeScenario: ProfileMockScenario | null = null
let mockSnapshot: JobProfileSnapshot | null = null

function copy<T>(value: T): T {
  return structuredClone(value)
}

function createProfileMockError(message: string): Error {
  return new Error(message)
}

function getMockSnapshot() {
  if (activeScenario !== env.profileMockScenario || !mockSnapshot) {
    activeScenario = env.profileMockScenario
    mockSnapshot = createProfileMockSnapshot(activeScenario)
  }

  return mockSnapshot
}

function requireProfile(snapshot: JobProfileSnapshot): JobProfile {
  if (!snapshot.profile) {
    throw createProfileMockError("Job profile does not exist.")
  }

  return snapshot.profile
}

function requireCurrentResume(profile: JobProfile): ResumeFile {
  if (!profile.resume) {
    throw createProfileMockError("Current resume does not exist.")
  }

  return profile.resume
}

function requireMatchingProfile(profile: JobProfile, profileId: string) {
  if (profile.profileId !== profileId) {
    throw createProfileMockError("Job profile was not found.")
  }
}

function createUploadedResume(file: File): ResumeFile {
  return {
    id: "resume_uploaded_initial",
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    uploadedAt: "2026-07-13T08:00:00.000Z",
    parsedAt: null,
    processingStatus: "uploaded",
    failureReason: null,
  }
}

function applySavedSection(profile: JobProfile, input: SaveProfileSectionInput) {
  switch (input.section) {
    case "basicInformation":
      profile.basicInformation = copy(input.values)
      return
    case "education":
      profile.education = copy(input.values)
      return
    case "workExperience":
      profile.workExperiences = copy(input.values)
      return
    case "projectExperience":
      profile.projectExperiences = copy(input.values)
      return
    case "skills":
      profile.skills = copy(input.values)
      return
    case "credentials":
      profile.credentials = copy(input.values)
      return
    case "careerDirection":
      profile.careerDirection = copy(input.values)
      return
    case "targetRoles":
      profile.targetRoles = copy(input.values)
      return
  }
}

function confirmAllReviews(profile: JobProfile) {
  profile.basicInformation.reviewStatus = "confirmed"
  profile.education.forEach((item) => {
    item.reviewStatus = "confirmed"
  })
  profile.workExperiences.forEach((item) => {
    item.reviewStatus = "confirmed"
  })
  profile.projectExperiences.forEach((item) => {
    item.reviewStatus = "confirmed"
  })
  profile.skills.forEach((item) => {
    item.reviewStatus = "confirmed"
  })
  profile.credentials.forEach((item) => {
    item.reviewStatus = "confirmed"
  })
  profile.careerDirection.reviewStatus = "confirmed"
  profile.targetRoles.forEach((item) => {
    item.reviewStatus = "confirmed"
  })
}

async function waitForProfileMock() {
  await waitForMockDelay(profileMockDelayMs)
}

export async function getJobProfile(): Promise<JobProfileSnapshot> {
  if (!env.mock) {
    throw new Error("Real job profile API is not implemented.")
  }

  await waitForProfileMock()
  return copy(getMockSnapshot())
}

export async function saveProfileSection(input: SaveProfileSectionInput): Promise<JobProfile> {
  if (!env.mock) {
    throw new Error("Real job profile API is not implemented.")
  }

  await waitForProfileMock()

  if (env.profileMockScenario === "saveFailure") {
    throw createProfileMockError("Mock profile save failed.")
  }

  const profile = requireProfile(getMockSnapshot())

  requireMatchingProfile(profile, input.profileId)

  if (profile.version !== input.version) {
    throw createProfileMockError("Job profile version is out of date.")
  }

  applySavedSection(profile, input)
  profile.updatedAt = "2026-07-13T08:05:00.000Z"
  profile.version += 1
  profile.matchingAnalysisStale = true

  return copy(profile)
}

export async function uploadInitialResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  if (!env.mock) {
    throw new Error("Real resume upload API is not implemented.")
  }

  await waitForProfileMock()

  const snapshot = getMockSnapshot()

  if (snapshot.profile) {
    throw createProfileMockError("A job profile already exists.")
  }

  const nextSnapshot = createProfileMockSnapshot("uploading")
  const profile = requireProfile(nextSnapshot)
  const resume = createUploadedResume(input.file)

  profile.resume = resume
  profile.updatedAt = resume.uploadedAt
  nextSnapshot.recognition = {
    resumeId: resume.id,
    processingStatus: resume.processingStatus,
    completedAt: null,
    failureReason: null,
    pendingReviewCount: 0,
  }
  mockSnapshot = nextSnapshot

  return copy(nextSnapshot)
}

export async function getResumeRecognitionStatus(
  profileId: string,
  resumeId: string,
): Promise<ResumeRecognition> {
  if (!env.mock) {
    throw new Error("Real resume recognition API is not implemented.")
  }

  await waitForProfileMock()

  const snapshot = getMockSnapshot()
  const profile = requireProfile(snapshot)
  const resume = requireCurrentResume(profile)

  requireMatchingProfile(profile, profileId)

  if (
    resume.id !== resumeId ||
    !snapshot.recognition ||
    snapshot.recognition.resumeId !== resumeId
  ) {
    throw createProfileMockError("Resume recognition was not found.")
  }

  return copy(snapshot.recognition)
}

export async function submitResumeRecognitionConfirmation(
  input: ResumeRecognitionConfirmationInput,
): Promise<JobProfile> {
  if (!env.mock) {
    throw new Error("Real resume recognition API is not implemented.")
  }

  await waitForProfileMock()

  const snapshot = getMockSnapshot()
  const profile = requireProfile(snapshot)
  const resume = requireCurrentResume(profile)

  requireMatchingProfile(profile, input.profileId)

  if (resume.id !== input.resumeId || !snapshot.recognition) {
    throw createProfileMockError("Resume recognition was not found.")
  }

  profile.status = "active"
  profile.pendingReviewCount = 0
  profile.completeness.needsReviewSections = []
  profile.matchingAnalysisStale = true
  profile.updatedAt = "2026-07-13T08:10:00.000Z"
  profile.version += 1
  snapshot.recognition.pendingReviewCount = 0
  confirmAllReviews(profile)

  return copy(profile)
}

export async function uploadUpdatedResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  if (!env.mock) {
    throw new Error("Real resume upload API is not implemented.")
  }

  await waitForProfileMock()

  const snapshot = getMockSnapshot()
  const profile = requireProfile(snapshot)

  if (profile.status !== "active") {
    throw createProfileMockError(
      "A confirmed job profile is required before uploading a new resume.",
    )
  }

  const resume = createUploadedResume(input.file)
  resume.id = "resume_uploaded_update"
  snapshot.resumeUpdate = {
    id: "resume_update_uploaded",
    createdAt: resume.uploadedAt,
    status: "awaitingConfirmation",
    pendingReviewCount: 0,
    resume,
  }

  return copy(snapshot)
}

export async function confirmResumeUpdate(input: ResumeUpdateDecisionInput): Promise<JobProfile> {
  if (!env.mock) {
    throw new Error("Real resume update API is not implemented.")
  }

  await waitForProfileMock()

  const snapshot = getMockSnapshot()
  const profile = requireProfile(snapshot)
  const resumeUpdate = snapshot.resumeUpdate

  requireMatchingProfile(profile, input.profileId)

  if (!resumeUpdate || resumeUpdate.id !== input.resumeUpdateId) {
    throw createProfileMockError("Resume update was not found.")
  }

  profile.resume = copy(resumeUpdate.resume)
  profile.updatedAt = "2026-07-13T08:15:00.000Z"
  profile.version += 1
  profile.matchingAnalysisStale = true
  snapshot.resumeUpdate = null

  return copy(profile)
}

export async function cancelResumeUpdate(
  input: ResumeUpdateDecisionInput,
): Promise<JobProfileSnapshot> {
  if (!env.mock) {
    throw new Error("Real resume upload API is not implemented.")
  }

  await waitForProfileMock()

  const snapshot = getMockSnapshot()
  const profile = requireProfile(snapshot)
  const resumeUpdate = snapshot.resumeUpdate

  requireMatchingProfile(profile, input.profileId)

  if (!resumeUpdate || resumeUpdate.id !== input.resumeUpdateId) {
    throw createProfileMockError("Resume update was not found.")
  }

  snapshot.resumeUpdate = null
  return copy(snapshot)
}
