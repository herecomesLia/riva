import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, TransportError } from "@/api/error"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import {
  createCareerProfile,
  getCareerProfile,
  extractCareerProfileFromText,
  updateCareerProfile,
} from "@/services/profile"

const careerProfileApi = vi.hoisted(() => ({
  createCareerProfile: vi.fn(),
  getCareerProfile: vi.fn(),
  updateCareerProfile: vi.fn(),
  extractCareerProfileFromText: vi.fn(),
}))

vi.mock("@/api/generated/endpoints/career-profile/career-profile", () => ({
  getCareerProfileApi: () => careerProfileApi,
}))

describe("profile service", () => {
  beforeEach(() => {
    vi.mocked(careerProfileApi.createCareerProfile).mockReset()
    vi.mocked(careerProfileApi.getCareerProfile).mockReset()
    vi.mocked(careerProfileApi.updateCareerProfile).mockReset()
    careerProfileApi.extractCareerProfileFromText.mockReset()
  })

  it("maps only resource.not_found to null", async () => {
    vi.mocked(careerProfileApi.getCareerProfile).mockRejectedValueOnce(
      new ApiError({
        error: { code: "resource.not_found", message: "Career profile was not found.", issues: [] },
      }),
    )
    await expect(getCareerProfile()).resolves.toBeNull()

    const transportError = new TransportError("network", "Network unavailable")
    vi.mocked(careerProfileApi.getCareerProfile).mockRejectedValueOnce(transportError)
    await expect(getCareerProfile()).rejects.toBe(transportError)
  })

  it("passes create and update through the generated operations", async () => {
    vi.mocked(careerProfileApi.createCareerProfile).mockResolvedValue(careerProfileFixture)
    vi.mocked(careerProfileApi.updateCareerProfile).mockResolvedValue(careerProfileFixture)

    await expect(createCareerProfile({})).resolves.toBe(careerProfileFixture)
    expect(careerProfileApi.createCareerProfile).toHaveBeenCalledWith({})

    const input = { skills: ["TypeScript"] }
    await expect(updateCareerProfile(input)).resolves.toBe(careerProfileFixture)
    expect(careerProfileApi.updateCareerProfile).toHaveBeenCalledWith(input)
  })

  it("submits extraction through the generated operation without returning a profile", async () => {
    careerProfileApi.extractCareerProfileFromText.mockResolvedValue(undefined)
    const input = { text: "resume" }

    await expect(extractCareerProfileFromText(input)).resolves.toBeUndefined()
    expect(careerProfileApi.extractCareerProfileFromText).toHaveBeenCalledWith(input)
  })
})
