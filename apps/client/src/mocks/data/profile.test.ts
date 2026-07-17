import { describe, expect, it } from "vitest"

import {
  createProfileMockSnapshot,
  type ProfileMockScenario,
  profileResponseMock,
} from "@/mocks/data/profile"
import type { JobProfileSnapshot, ProfileStatus, ResumeProcessingStatus } from "@/models/profile"

const scenarios: ProfileMockScenario[] = [
  "complete",
  "noProfile",
  "emptyManualProfile",
  "profileWithoutResume",
  "initialResumeUploading",
  "initialResumeRecognizing",
  "initialResumeRecognitionSucceeded",
  "initialResumeRecognitionFailed",
  "initialResumeRecognitionFailedWithoutReason",
  "partial",
  "resumeUpdateUploading",
  "resumeUpdateRecognizing",
  "resumeUpdateSucceeded",
  "resumeUpdateFailed",
  "matchingAnalysisStale",
]

const processingStatusByProfileStatus: Partial<Record<ProfileStatus, ResumeProcessingStatus>> = {
  uploadingResume: "uploaded",
  parsingResume: "parsing",
  recognitionFailed: "failed",
}

function expectConsistentSnapshot(snapshot: JobProfileSnapshot) {
  const { matchingAnalysis, profile, recognition, resumeUpdate } = snapshot

  if (!profile) {
    expect(recognition).toBeNull()
    expect(resumeUpdate).toBeNull()
    expect(matchingAnalysis).toBeNull()
    return
  }

  if (!profile.resume) {
    expect(recognition).toBeNull()
  } else {
    expect(recognition).toMatchObject({
      resumeId: profile.resume.id,
      processingStatus: profile.resume.processingStatus,
      completedAt: profile.resume.parsedAt,
      failureReason: profile.resume.failureReason,
    })
  }

  const expectedProcessingStatus = processingStatusByProfileStatus[profile.status]
  if (expectedProcessingStatus) {
    expect(profile.resume?.processingStatus).toBe(expectedProcessingStatus)
    expect(recognition?.processingStatus).toBe(expectedProcessingStatus)
  }

  if (
    profile.education.length === 0 &&
    profile.workExperiences.length === 0 &&
    profile.projectExperiences.length === 0 &&
    profile.skills.length === 0 &&
    profile.credentials.length === 0 &&
    profile.targetRoles.length === 0
  ) {
    expect(profile.completeness).toEqual({
      percentage: 0,
      missingSections: [
        "education",
        "workExperience",
        "projectExperience",
        "skills",
        "credentials",
        "targetRoles",
      ],
    })
  }

  if (resumeUpdate?.status === "succeeded") {
    expect(resumeUpdate.changeSummary).not.toBeNull()
    expect(resumeUpdate.failureReason).toBeNull()
  }

  if (matchingAnalysis) {
    expect(matchingAnalysis.status === "stale").toBe(profile.matchingAnalysisStale)
    if (matchingAnalysis.status === "current") {
      expect(matchingAnalysis.profileVersion).toBe(profile.version)
    }
    if (matchingAnalysis.status === "stale") {
      expect(matchingAnalysis.profileVersion).toBeLessThan(profile.version)
    }
  } else {
    expect(profile.matchingAnalysisStale).toBe(false)
  }
}

describe("profile mock scenarios", () => {
  it.each(scenarios)("keeps the %s snapshot internally consistent", (scenario) => {
    expectConsistentSnapshot(createProfileMockSnapshot(scenario))
  })

  it("returns an independent deep copy for each scenario request", () => {
    const first = createProfileMockSnapshot()
    const second = createProfileMockSnapshot()

    first.profile!.education[0]!.school = "Mutated University"

    expect(second).toEqual(profileResponseMock)
    expect(second).not.toBe(first)
    expect(second.profile).not.toBe(first.profile)
  })
})
