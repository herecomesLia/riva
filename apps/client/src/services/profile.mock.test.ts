import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { setupServer } from "msw/node"

import { careerProfileFaker, createCareerProfileFaker } from "@/mocks/fakers/career-profile"
import { careerProfileHandlers } from "@/mocks/handlers/career-profile"
import * as profileService from "@/services/profile"
import {
  careerProfileFixture,
  careerProfileFailInput,
  resumeImportedCareerProfileFixture,
} from "@/mocks/fixtures/career-profile"

const server = setupServer(...careerProfileHandlers)
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterAll(() => server.close())

function createFaker(initial: Parameters<typeof createCareerProfileFaker>[0]) {
  const faker = createCareerProfileFaker(initial)
  vi.spyOn(careerProfileFaker, "getCareerProfile").mockImplementation(faker.getCareerProfile)
  vi.spyOn(careerProfileFaker, "createCareerProfile").mockImplementation(faker.createCareerProfile)
  vi.spyOn(careerProfileFaker, "updateCareerProfile").mockImplementation(faker.updateCareerProfile)
  vi.spyOn(careerProfileFaker, "extractCareerProfileFromText").mockImplementation(
    faker.extractCareerProfileFromText,
  )
  vi.spyOn(careerProfileFaker, "getCareerProfileExtractionState").mockImplementation(
    faker.getCareerProfileExtractionState,
  )
  vi.spyOn(careerProfileFaker, "retryCareerProfileExtraction").mockImplementation(
    faker.retryCareerProfileExtraction,
  )
  vi.spyOn(careerProfileFaker, "abortCareerProfileExtraction").mockImplementation(
    faker.abortCareerProfileExtraction,
  )
  return profileService
}

describe("careerProfileFaker", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  it("validates the final patched profile without persisting a rejected update", async () => {
    const faker = createFaker(careerProfileFixture)

    await expect(faker.updateCareerProfile({ skills: ["Python"] })).rejects.toMatchObject({
      code: "domain.validation_failed",
    })
    await expect(faker.getCareerProfile()).resolves.toEqual(careerProfileFixture)
  })

  it("changes the content version only when profile content changes", async () => {
    const faker = createFaker(careerProfileFixture)
    const unchanged = await faker.updateCareerProfile({ skills: careerProfileFixture.skills })
    expect(unchanged.updatedAt).toBe(careerProfileFixture.updatedAt)
    const changed = await faker.updateCareerProfile({
      skills: [...careerProfileFixture.skills, "Python"],
    })
    expect(changed.updatedAt).not.toBe(unchanged.updatedAt)
    const changedAgain = await faker.updateCareerProfile({ skills: [...changed.skills, "Go"] })
    expect(changedAgain.updatedAt).not.toBe(changed.updatedAt)
  })

  it.each([null, careerProfileFixture])(
    "creates or replaces the entire profile only on successful completion (%#)",
    async (initial) => {
      vi.useFakeTimers({ toFake: ["Date"] })
      const faker = createFaker(initial)
      await faker.extractCareerProfileFromText({ text: "resume" })
      await expect(faker.getCareerProfileExtractionState()).resolves.toMatchObject({
        status: "queued",
      })
      await expect(faker.createCareerProfile({})).rejects.toMatchObject({
        code: "resource.conflict",
      })
      await expect(faker.updateCareerProfile({ skills: [] })).rejects.toMatchObject({
        code: "resource.conflict",
      })
      vi.advanceTimersByTime(500)
      await expect(faker.getCareerProfileExtractionState()).resolves.toMatchObject({
        status: "running",
      })
      if (initial) await expect(faker.getCareerProfile()).resolves.toEqual(initial)
      else await expect(faker.getCareerProfile()).resolves.toBeNull()
      vi.advanceTimersByTime(2000)
      await expect(faker.getCareerProfileExtractionState()).resolves.toMatchObject({
        status: "idle",
      })
      const result = await faker.getCareerProfile()
      expect(result).toEqual({
        ...resumeImportedCareerProfileFixture,
        createdAt: initial?.createdAt ?? resumeImportedCareerProfileFixture.createdAt,
        updatedAt: result!.updatedAt,
      })
    },
  )

  it("preserves the profile on failure and retries the failed task", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const faker = createFaker(careerProfileFixture)
    await expect(faker.retryCareerProfileExtraction()).rejects.toMatchObject({
      code: "resource.conflict",
    })
    await faker.extractCareerProfileFromText({ text: careerProfileFailInput })
    vi.advanceTimersByTime(2500)
    await expect(faker.getCareerProfileExtractionState()).resolves.toMatchObject({
      status: "failed",
      error: { code: "invalid_output" },
    })
    await expect(faker.getCareerProfile()).resolves.toEqual(careerProfileFixture)
    await faker.retryCareerProfileExtraction()
    await expect(faker.getCareerProfileExtractionState()).resolves.toMatchObject({
      status: "queued",
    })
    vi.advanceTimersByTime(2500)
    await expect(faker.getCareerProfileExtractionState()).resolves.toMatchObject({ status: "idle" })
    expect((await faker.getCareerProfile())!.projects).toEqual(
      resumeImportedCareerProfileFixture.projects,
    )
  })

  it.each([0, 500])(
    "aborts an active extraction without replacing the profile (%i ms)",
    async (elapsed) => {
      vi.useFakeTimers({ toFake: ["Date"] })
      const faker = createFaker(careerProfileFixture)
      await faker.extractCareerProfileFromText({ text: "resume" })
      vi.advanceTimersByTime(elapsed)
      await faker.abortCareerProfileExtraction()
      await faker.abortCareerProfileExtraction()
      await expect(faker.getCareerProfileExtractionState()).resolves.toMatchObject({
        status: "aborting",
      })
      vi.advanceTimersByTime(3000)
      await expect(faker.getCareerProfileExtractionState()).resolves.toMatchObject({
        status: "idle",
      })
      await expect(faker.getCareerProfile()).resolves.toEqual(careerProfileFixture)
    },
  )

  it("supersedes the old task and clears a failed task after manual editing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const faker = createFaker(careerProfileFixture)
    await faker.extractCareerProfileFromText({ text: "resume" })
    vi.advanceTimersByTime(2000)
    await faker.extractCareerProfileFromText({ text: careerProfileFailInput })
    vi.advanceTimersByTime(500)
    await expect(faker.getCareerProfileExtractionState()).resolves.toMatchObject({
      status: "running",
    })
    await expect(faker.getCareerProfile()).resolves.toEqual(careerProfileFixture)
    vi.advanceTimersByTime(2000)
    await expect(faker.getCareerProfileExtractionState()).resolves.toMatchObject({
      status: "failed",
    })
    await faker.updateCareerProfile({ skills: careerProfileFixture.skills })
    await expect(faker.getCareerProfileExtractionState()).resolves.toMatchObject({ status: "idle" })
  })
})
