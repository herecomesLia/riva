import { env } from "@/app/env"
import * as profileMockService from "@/mocks/services/profile"
import type {
  JobProfileSnapshot,
  MatchingAnalysis,
  ResumeRecognition,
  ResumeUpdate,
  ResumeUploadInput,
  SaveProfileSectionInput,
} from "@/models/profile"

function realApiUnavailable(): never {
  throw new Error("Real job profile API is not implemented.")
}

export function getJobProfile(): Promise<JobProfileSnapshot> {
  return env.mock ? profileMockService.getJobProfile() : realApiUnavailable()
}

export function saveProfileSection(input: SaveProfileSectionInput): Promise<JobProfileSnapshot> {
  return env.mock ? profileMockService.saveProfileSection(input) : realApiUnavailable()
}

export function uploadInitialResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  return env.mock ? profileMockService.uploadInitialResume(input) : realApiUnavailable()
}

export function startInitialResumeRecognition(
  profileId: string,
  resumeId: string,
): Promise<JobProfileSnapshot> {
  return env.mock
    ? profileMockService.startInitialResumeRecognition(profileId, resumeId)
    : realApiUnavailable()
}

export function resetInitialResumeImport(
  profileId: string,
  resumeId: string,
): Promise<JobProfileSnapshot> {
  return env.mock
    ? profileMockService.resetInitialResumeImport(profileId, resumeId)
    : realApiUnavailable()
}

export function createManualJobProfile(): Promise<JobProfileSnapshot> {
  return env.mock ? profileMockService.createManualJobProfile() : realApiUnavailable()
}

export function getResumeRecognitionStatus(
  profileId: string,
  resumeId: string,
): Promise<ResumeRecognition> {
  return env.mock
    ? profileMockService.getResumeRecognitionStatus(profileId, resumeId)
    : realApiUnavailable()
}

export function uploadUpdatedResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  return env.mock ? profileMockService.uploadUpdatedResume(input) : realApiUnavailable()
}

export function startUpdatedResumeRecognition(
  profileId: string,
  resumeUpdateId: string,
): Promise<JobProfileSnapshot> {
  return env.mock
    ? profileMockService.startUpdatedResumeRecognition(profileId, resumeUpdateId)
    : realApiUnavailable()
}

export function getResumeUpdateStatus(
  profileId: string,
  resumeUpdateId: string,
): Promise<ResumeUpdate> {
  return env.mock
    ? profileMockService.getResumeUpdateStatus(profileId, resumeUpdateId)
    : realApiUnavailable()
}

export function regenerateMatchingAnalysis(profileId: string): Promise<MatchingAnalysis> {
  return env.mock ? profileMockService.regenerateMatchingAnalysis(profileId) : realApiUnavailable()
}
