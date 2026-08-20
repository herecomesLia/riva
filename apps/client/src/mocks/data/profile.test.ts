import { describe, expect, it } from "vitest"

import {
  createProfileMockSnapshot,
  type ProfileMockScenario,
  profileResponseMock,
} from "@/mocks/data/profile"
import type { JobProfileSnapshot } from "@/models/profile"

const scenarios: ProfileMockScenario[] = [
  "complete",
  "noProfile",
  "emptyManualProfile",
  "profileWithoutResume",
  "partial",
]

function expectConsistentSnapshot(snapshot: JobProfileSnapshot) {
  const { profile } = snapshot
  if (!profile) return

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
