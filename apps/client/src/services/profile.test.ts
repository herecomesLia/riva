import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ProfileMockScenario } from "@/mocks/data/profile"
import {
  cancelResumeUpdate,
  confirmResumeUpdate,
  getJobProfile,
  getResumeRecognitionStatus,
  saveProfileSection,
  submitResumeRecognitionConfirmation,
  uploadInitialResume,
  uploadUpdatedResume,
} from "@/services/profile"

const { envState } = vi.hoisted(() => ({
  envState: {
    mock: true,
    profileMockScenario: "complete" as ProfileMockScenario,
  },
}))

vi.mock("@/app/env", () => ({
  env: envState,
}))

async function settleMockRequest<T>(request: Promise<T>) {
  await vi.advanceTimersByTimeAsync(500)
  return request
}

async function setMockScenario(scenario: ProfileMockScenario) {
  envState.profileMockScenario = "notCreated"
  await settleMockRequest(getJobProfile())
  envState.profileMockScenario = scenario
}

async function getProfileForScenario(scenario: ProfileMockScenario) {
  await setMockScenario(scenario)
  const snapshot = await settleMockRequest(getJobProfile())

  return snapshot.profile
}

function createResumeFile() {
  return new File(["resume"], "candidate-resume.pdf", {
    type: "application/pdf",
  })
}

describe("job profile mock service", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns the configured lifecycle data after the mock delay", async () => {
    await setMockScenario("recognitionFailed")
    let settled = false
    const request = getJobProfile().then((snapshot) => {
      settled = true
      return snapshot
    })

    await vi.advanceTimersByTimeAsync(499)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    const snapshot = await request

    expect(snapshot.profile?.status).toBe("recognitionFailed")
    expect(snapshot.recognition).toMatchObject({
      failureReason: "The document could not be parsed.",
      processingStatus: "failed",
    })
  })

  it("returns independent snapshots for callers", async () => {
    await setMockScenario("complete")
    const firstSnapshot = await settleMockRequest(getJobProfile())

    firstSnapshot.profile!.basicInformation.name = "Mutated name"

    const secondSnapshot = await settleMockRequest(getJobProfile())

    expect(secondSnapshot.profile?.basicInformation.name).toBe("Lin Chen")
  })

  it("returns no profile until a user creates one", async () => {
    const profile = await getProfileForScenario("notCreated")

    expect(profile).toBeNull()
  })

  it("saves one typed profile section and marks matching analysis stale", async () => {
    const profile = (await getProfileForScenario("complete"))!
    const request = saveProfileSection({
      profileId: profile.profileId,
      version: profile.version,
      section: "basicInformation",
      values: {
        ...profile.basicInformation,
        personalSummary: "Updated profile summary.",
        fieldSources: {
          ...profile.basicInformation.fieldSources,
          personalSummary: "userEdited",
        },
      },
    })
    const savedProfile = await settleMockRequest(request)

    expect(savedProfile.basicInformation.personalSummary).toBe("Updated profile summary.")
    expect(savedProfile.version).toBe(profile.version + 1)
    expect(savedProfile.matchingAnalysisStale).toBe(true)
  })

  it("returns a service-controlled save error for the failure scenario", async () => {
    const profile = (await getProfileForScenario("saveFailure"))!
    const request = saveProfileSection({
      profileId: profile.profileId,
      version: profile.version,
      section: "skills",
      values: profile.skills,
    })
    const expectation = expect(request).rejects.toThrow("Mock profile save failed.")

    await vi.advanceTimersByTimeAsync(500)

    await expectation
  })

  it("uploads an initial resume without placing File in the returned profile data", async () => {
    await setMockScenario("notCreated")
    const upload = await settleMockRequest(uploadInitialResume({ file: createResumeFile() }))
    const profile = upload.profile!

    expect(profile.status).toBe("uploadingResume")
    expect(profile.resume).toMatchObject({
      fileName: "candidate-resume.pdf",
      mimeType: "application/pdf",
      processingStatus: "uploaded",
    })
    expect(profile.resume).not.toBeInstanceOf(File)

    const recognition = await settleMockRequest(
      getResumeRecognitionStatus(profile.profileId, profile.resume!.id),
    )
    expect(recognition.processingStatus).toBe("uploaded")
  })

  it("exposes a confirmed profile after the recognition result is accepted", async () => {
    await setMockScenario("awaitingConfirmation")
    const snapshot = await settleMockRequest(getJobProfile())
    const profile = snapshot.profile!
    const updatedProfile = await settleMockRequest(
      submitResumeRecognitionConfirmation({
        profileId: profile.profileId,
        resumeId: profile.resume!.id,
      }),
    )

    expect(updatedProfile.status).toBe("active")
    expect(updatedProfile.pendingReviewCount).toBe(0)
    expect(updatedProfile.matchingAnalysisStale).toBe(true)
  })

  it("supports confirming and cancelling a pending resume update", async () => {
    await setMockScenario("resumeUpdateAwaitingConfirmation")
    const pendingSnapshot = await settleMockRequest(getJobProfile())
    const profile = pendingSnapshot.profile!
    const resumeUpdate = pendingSnapshot.resumeUpdate!
    const confirmedProfile = await settleMockRequest(
      confirmResumeUpdate({
        profileId: profile.profileId,
        resumeUpdateId: resumeUpdate.id,
      }),
    )

    expect(confirmedProfile.resume?.id).toBe(resumeUpdate.resume.id)
    expect(confirmedProfile.matchingAnalysisStale).toBe(true)

    await setMockScenario("resumeUpdateAwaitingConfirmation")
    const cancellableSnapshot = await settleMockRequest(getJobProfile())
    const cancelledSnapshot = await settleMockRequest(
      cancelResumeUpdate({
        profileId: cancellableSnapshot.profile!.profileId,
        resumeUpdateId: cancellableSnapshot.resumeUpdate!.id,
      }),
    )

    expect(cancelledSnapshot.resumeUpdate).toBeNull()
    expect(cancelledSnapshot.profile?.resume?.id).toBe("resume_2026_01")
  })

  it("creates a pending resume update from an active profile", async () => {
    await setMockScenario("complete")
    await settleMockRequest(getJobProfile())

    const snapshot = await settleMockRequest(uploadUpdatedResume({ file: createResumeFile() }))

    expect(snapshot.resumeUpdate).toMatchObject({
      status: "awaitingConfirmation",
      resume: {
        fileName: "candidate-resume.pdf",
        processingStatus: "uploaded",
      },
    })
  })

  it("reports stale matching analysis as backend business data", async () => {
    const profile = await getProfileForScenario("matchingAnalysisStale")

    expect(profile?.matchingAnalysisStale).toBe(true)
  })
})
