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
]

const processingStatusByProfileStatus: Partial<Record<ProfileStatus, ResumeProcessingStatus>> = {
  uploadingResume: "uploaded",
  parsingResume: "parsing",
  recognitionFailed: "failed",
}

function expectConsistentSnapshot(snapshot: JobProfileSnapshot) {
  const { profile, recognition, resumeUpdate } = snapshot

  if (!profile) {
    expect(recognition).toBeNull()
    expect(resumeUpdate).toBeNull()
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
    profile.skills.length === 0
  ) {
    expect(profile.completeness).toEqual({
      percentage: 0,
      missingSections: ["education", "workExperience", "projectExperience", "skills"],
    })
  }

  if (resumeUpdate?.status === "succeeded") {
    expect(resumeUpdate.changeSummary).not.toBeNull()
    expect(resumeUpdate.failureReason).toBeNull()
    expect(profile.resume).not.toBeNull()
    expect(profile.resume).toMatchObject({
      id: resumeUpdate.resume.id,
      parsedAt: resumeUpdate.resume.parsedAt,
      processingStatus: "succeeded",
      uploadedAt: resumeUpdate.resume.uploadedAt,
    })
    expect(resumeUpdate.resume.parsedAt).not.toBeNull()
    expect(new Date(resumeUpdate.resume.parsedAt!).getTime()).toBeGreaterThanOrEqual(
      new Date(resumeUpdate.resume.uploadedAt).getTime(),
    )
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
