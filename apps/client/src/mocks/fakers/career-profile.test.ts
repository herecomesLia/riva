import { describe, expect, it } from "vitest"

import { createCareerProfileFaker } from "@/mocks/fakers/career-profile"
import {
  careerProfileFixture,
  resumeImportedCareerProfileFixture,
} from "@/mocks/fixtures/career-profile"

describe("careerProfileFaker", () => {
  it("validates the final patched profile without persisting a rejected update", async () => {
    const faker = createCareerProfileFaker(careerProfileFixture)

    await expect(faker.update({ skills: ["Python"] })).rejects.toMatchObject({
      code: "career_profile.skill_mismatch",
    })
    await expect(faker.get()).resolves.toEqual(careerProfileFixture)
  })

  it("persists the imported resume profile", async () => {
    const faker = createCareerProfileFaker(null)

    const imported = await faker.importResume({ text: "mock resume" })

    expect(imported).toEqual(resumeImportedCareerProfileFixture)
    await expect(faker.get()).resolves.toEqual(resumeImportedCareerProfileFixture)
  })
})
