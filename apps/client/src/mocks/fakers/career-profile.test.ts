import { describe, expect, it } from "vitest"

import { createCareerProfileFaker } from "@/mocks/fakers/career-profile"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"

describe("careerProfileFaker", () => {
  it("validates the final patched profile without persisting a rejected update", async () => {
    const faker = createCareerProfileFaker(careerProfileFixture)

    await expect(faker.update({ skills: ["Python"] })).rejects.toMatchObject({
      code: "career_profile.skill_mismatch",
    })
    await expect(faker.get()).resolves.toEqual(careerProfileFixture)
  })
})
