import { describe, expect, it } from "vitest"

import { createProfileMockSnapshot, type ProfileMockScenario } from "@/mocks/data/profile"

const profileMockScenarios: ProfileMockScenario[] = [
  "notCreated",
  "uploading",
  "parsing",
  "recognitionFailed",
  "awaitingConfirmation",
  "needsReview",
  "complete",
  "incomplete",
  "saveFailure",
  "resumeUpdateAwaitingConfirmation",
  "matchingAnalysisStale",
]

describe("profile mock fixtures", () => {
  it.each(profileMockScenarios)("creates an independent %s snapshot", (scenario) => {
    const firstSnapshot = createProfileMockSnapshot(scenario)
    const secondSnapshot = createProfileMockSnapshot(scenario)

    expect(secondSnapshot).toEqual(firstSnapshot)
    expect(secondSnapshot).not.toBe(firstSnapshot)

    if (firstSnapshot.profile && secondSnapshot.profile) {
      firstSnapshot.profile.updatedAt = "mutated"

      expect(secondSnapshot.profile.updatedAt).not.toBe("mutated")
      expect(secondSnapshot.profile).not.toBe(firstSnapshot.profile)
    }
  })

  it("uses stable IDs and keeps draft-only state out of the server profile", () => {
    const snapshot = createProfileMockSnapshot("complete")
    const profile = snapshot.profile!
    const skillIds = new Set(profile.skills.map((skill) => skill.id))
    const workExperienceIds = new Set(profile.workExperiences.map((experience) => experience.id))

    expect(profile.profileId).toBeTruthy()
    expect(profile.workExperiences).toHaveLength(workExperienceIds.size)
    expect(profile.projectExperiences[0].relatedWorkExperienceId).toBe("work_northstar_2022")
    expect(profile.workExperiences[0].skillIds.every((id) => skillIds.has(id))).toBe(true)
    expect(profile).not.toHaveProperty("hasUnsavedChanges")
  })
})
