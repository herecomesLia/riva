import { env } from "@/app/env"
import { profileResponseMock } from "@/mocks/data/profile"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  JobProfile,
  JobProfileSnapshot,
  MatchingAnalysis,
  ResumeFile,
  ResumeRecognition,
  ResumeRecognitionConfirmationInput,
  ResumeUpdateDecisionInput,
  ResumeUploadInput,
  SaveProfileSectionInput,
} from "@/models/profile"

function copy<T>(value: T): T {
  return structuredClone(value)
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

function requireMatchingProfile(profileId: string) {
  if (profileId !== profileResponseMock.profile?.profileId) {
    throw new Error("Job profile was not found.")
  }
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

function applySavedSection(profile: JobProfile, input: SaveProfileSectionInput) {
  switch (input.section) {
    case "education":
      profile.education = copy(input.values)
      break
    case "workExperience":
      profile.workExperiences = copy(input.values)
      break
    case "projectExperience":
      profile.projectExperiences = copy(input.values)
      break
    case "skills":
      profile.skills = copy(input.values)
      break
    case "credentials":
      profile.credentials = copy(input.values)
      break
    case "targetRoles":
      profile.targetRoles = copy(input.values)
  }
}

export async function getJobProfile(): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  return copy(profileResponseMock)
}

export async function saveProfileSection(input: SaveProfileSectionInput): Promise<JobProfile> {
  requireMock()
  await waitForProfileMock()
  const profile = standardProfile()
  requireMatchingProfile(input.profileId)
  if (profile.version !== input.version) throw new Error("Job profile version is out of date.")

  applySavedSection(profile, input)
  profile.updatedAt = "2026-07-13T08:05:00.000Z"
  profile.version += 1
  profile.matchingAnalysisStale = true
  return profile
}

export async function uploadInitialResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  const profile = standardProfile()
  const resume = createUploadedResume(input, "resume_uploaded_initial")
  profile.status = "uploadingResume"
  profile.resume = resume
  profile.updatedAt = resume.uploadedAt

  return {
    profile,
    recognition: {
      resumeId: resume.id,
      processingStatus: "uploaded",
      completedAt: null,
      failureReason: null,
      pendingReviewCount: 0,
    },
    resumeUpdate: null,
    matchingAnalysis: null,
  }
}

export async function startInitialResumeRecognition(
  profileId: string,
  resumeId: string,
): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  requireMatchingProfile(profileId)
  const profile = standardProfile()
  profile.status = "awaitingConfirmation"
  profile.pendingReviewCount = 3
  profile.completeness.needsReviewSections = ["education", "workExperience", "projectExperience"]
  profile.resume = {
    ...profile.resume!,
    id: resumeId,
    parsedAt: "2026-07-13T08:02:00.000Z",
    processingStatus: "succeeded",
  }

  return {
    profile,
    recognition: {
      resumeId,
      processingStatus: "succeeded",
      completedAt: profile.resume.parsedAt,
      failureReason: null,
      pendingReviewCount: profile.pendingReviewCount,
    },
    resumeUpdate: null,
    matchingAnalysis: null,
  }
}

export async function cancelResumeRecognitionReview(
  profileId: string,
  _resumeId: string,
): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  requireMatchingProfile(profileId)
  return { profile: null, recognition: null, resumeUpdate: null, matchingAnalysis: null }
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
  return { profile, recognition: null, resumeUpdate: null, matchingAnalysis: null }
}

export async function getResumeRecognitionStatus(
  profileId: string,
  resumeId: string,
): Promise<ResumeRecognition> {
  requireMock()
  await waitForProfileMock()
  requireMatchingProfile(profileId)
  return {
    resumeId,
    processingStatus: "succeeded",
    completedAt: "2026-07-13T08:02:00.000Z",
    failureReason: null,
    pendingReviewCount: 3,
  }
}

export async function submitResumeRecognitionConfirmation(
  input: ResumeRecognitionConfirmationInput,
): Promise<JobProfile> {
  requireMock()
  await waitForProfileMock()
  requireMatchingProfile(input.profileId)
  const profile = standardProfile()
  profile.resume = { ...profile.resume!, id: input.resumeId }
  profile.status = "active"
  profile.matchingAnalysisStale = true
  profile.updatedAt = "2026-07-13T08:10:00.000Z"
  profile.version += 1
  return profile
}

export async function uploadUpdatedResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  const snapshot: JobProfileSnapshot = copy(profileResponseMock)
  const resume = createUploadedResume(input, "resume_uploaded_update")
  snapshot.resumeUpdate = {
    id: "resume_update_uploaded",
    createdAt: resume.uploadedAt,
    status: "uploading",
    pendingReviewCount: 0,
    resume,
    changeSummary: null,
    failureReason: null,
    proposedProfile: null,
    preservesManualChanges: true,
  }
  return snapshot
}

export async function startUpdatedResumeRecognition(
  input: ResumeUpdateDecisionInput,
): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  requireMatchingProfile(input.profileId)
  if (input.resumeUpdateId !== "resume_update_uploaded") {
    throw new Error("Resume update was not found.")
  }

  const snapshot: JobProfileSnapshot = copy(profileResponseMock)
  const resume = {
    ...snapshot.profile!.resume!,
    id: "resume_uploaded_update",
    parsedAt: "2026-07-13T08:04:00.000Z",
    processingStatus: "succeeded" as const,
  }
  snapshot.resumeUpdate = {
    id: input.resumeUpdateId,
    createdAt: "2026-07-13T08:00:00.000Z",
    status: "awaitingConfirmation",
    pendingReviewCount: 3,
    resume,
    changeSummary: { newItems: 1, changedItems: 2, missingItems: 1 },
    failureReason: null,
    proposedProfile: { ...standardProfile(), resume },
    preservesManualChanges: true,
  }
  return snapshot
}

export async function confirmResumeUpdate(input: ResumeUpdateDecisionInput): Promise<JobProfile> {
  requireMock()
  await waitForProfileMock()
  requireMatchingProfile(input.profileId)
  if (input.resumeUpdateId !== "resume_update_uploaded") {
    throw new Error("Resume update was not found.")
  }

  const profile = standardProfile()
  profile.updatedAt = "2026-07-13T08:15:00.000Z"
  profile.version += 1
  profile.matchingAnalysisStale = true
  return profile
}

export async function regenerateMatchingAnalysis(profileId: string): Promise<MatchingAnalysis> {
  requireMock()
  await waitForProfileMock()
  requireMatchingProfile(profileId)
  return {
    status: "current",
    profileVersion: profileResponseMock.profile!.version,
    generatedAt: "2026-07-13T08:20:00.000Z",
    failureReason: null,
  }
}

export async function cancelResumeUpdate(
  input: ResumeUpdateDecisionInput,
): Promise<JobProfileSnapshot> {
  requireMock()
  await waitForProfileMock()
  requireMatchingProfile(input.profileId)
  if (input.resumeUpdateId !== "resume_update_uploaded") {
    throw new Error("Resume update was not found.")
  }
  return copy(profileResponseMock)
}
