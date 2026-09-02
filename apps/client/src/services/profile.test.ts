import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, TransportError } from "@/api/error"
import {
  createCareerProfile,
  getCareerProfile,
  updateCareerProfile,
} from "@/api/generated/endpoints/career-profile/career-profile"
import { careerProfileFaker } from "@/mocks/fakers/career-profile"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import { createProfile, getProfile, importResume, updateProfile } from "@/services/profile"

vi.mock("@/api/generated/endpoints/career-profile/career-profile", () => ({
  createCareerProfile: vi.fn(),
  getCareerProfile: vi.fn(),
  updateCareerProfile: vi.fn(),
}))

vi.mock("@/mocks/fakers/career-profile", () => ({
  careerProfileFaker: { importResume: vi.fn() },
}))

describe("profile service", () => {
  beforeEach(() => {
    vi.mocked(createCareerProfile).mockReset()
    vi.mocked(getCareerProfile).mockReset()
    vi.mocked(updateCareerProfile).mockReset()
    vi.mocked(careerProfileFaker.importResume).mockReset()
  })

  it("maps only resource.not_found to null", async () => {
    vi.mocked(getCareerProfile).mockRejectedValueOnce(
      new ApiError({
        error: { code: "resource.not_found", message: "Career profile was not found." },
      }),
    )
    await expect(getProfile()).resolves.toBeNull()

    const transportError = new TransportError("network", "Network unavailable")
    vi.mocked(getCareerProfile).mockRejectedValueOnce(transportError)
    await expect(getProfile()).rejects.toBe(transportError)
  })

  it("passes create and update through the generated operations", async () => {
    vi.mocked(createCareerProfile).mockResolvedValue(careerProfileFixture)
    vi.mocked(updateCareerProfile).mockResolvedValue(careerProfileFixture)

    await expect(createProfile()).resolves.toBe(careerProfileFixture)
    expect(createCareerProfile).toHaveBeenCalledWith({})

    const input = { skills: ["TypeScript"] }
    await expect(updateProfile(input)).resolves.toBe(careerProfileFixture)
    expect(updateCareerProfile).toHaveBeenCalledWith(input)
  })

  it("uses the raw faker for the API-less resume import", async () => {
    vi.mocked(careerProfileFaker.importResume).mockResolvedValue(careerProfileFixture)
    const input = { text: "resume" }

    await expect(importResume(input)).resolves.toBe(careerProfileFixture)
    expect(careerProfileFaker.importResume).toHaveBeenCalledWith(input)
  })
})
