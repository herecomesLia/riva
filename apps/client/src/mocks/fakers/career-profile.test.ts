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
      code: "domain.validation_failed",
    })
    await expect(faker.get()).resolves.toEqual(careerProfileFixture)
  })

  it("changes the content version only when profile content changes", async () => {
    const faker = createCareerProfileFaker(careerProfileFixture)
    const unchanged = await faker.update({ skills: careerProfileFixture.skills })
    expect(unchanged.updatedAt).toBe(careerProfileFixture.updatedAt)
    const changed = await faker.update({ skills: [...careerProfileFixture.skills, "Python"] })
    expect(changed.updatedAt).not.toBe(unchanged.updatedAt)
    const changedAgain = await faker.update({ skills: [...changed.skills, "Go"] })
    expect(changedAgain.updatedAt).not.toBe(changed.updatedAt)
  })

  it("persists the imported resume profile", async () => {
    const faker = createCareerProfileFaker(null)

    const imported = await faker.importResume({ text: "mock resume" })

    expect(imported).toEqual(resumeImportedCareerProfileFixture)
    await expect(faker.get()).resolves.toEqual(resumeImportedCareerProfileFixture)
  })
})
