import { getProfile } from "@/services/profile"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import { createRoleStoryResponse } from "@/pages/roles/stories/role-story-fixtures"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { interviewFaker } from "@/mocks/fakers/interview"
import { interviewFixture } from "@/mocks/fixtures/interview"
import { targetRoleFixture } from "@/mocks/fixtures/target-role"
import type { TargetRoleListResponse } from "@/api/generated/models"
import { getRoles, getJdExtractionState } from "@/services/roles"
import {
  getInterviewPage,
  getInterviewReview,
  prepareInterviewTrainingEntry,
} from "@/services/interview"

vi.mock("@/services/roles", () => ({ getRoles: vi.fn(), getJdExtractionState: vi.fn() }))
vi.mock("@/services/profile", () => ({ getProfile: vi.fn() }))

const roles: TargetRoleListResponse = {
  targetRoles: ["first", "active", "missing", "archived"].map((id) => ({
    ...structuredClone(targetRoleFixture),
    id,
    isArchived: id === "archived",
    jd:
      id === "missing"
        ? createRoleStoryResponse("singleRoleWithoutJobDescription").targetRoles[0]!.jd
        : targetRoleFixture.jd,
  })),
  activeTargetRoleId: "active",
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.mocked(getProfile).mockResolvedValue(careerProfileFixture)
  vi.mocked(getJdExtractionState).mockResolvedValue({ status: "idle", error: null })
  vi.mocked(getRoles).mockResolvedValue(structuredClone(roles))
  vi.spyOn(interviewFaker, "get").mockReturnValue(null)
})

describe("Interview service", () => {
  it("combines ready roles, defaults and the current session", async () => {
    const page = await getInterviewPage()
    expect(page.session).toBeNull()
    expect(page.setup.targetRoles.map(({ id }) => id)).toEqual(["first", "active"])
    expect(page.setup.targetRoles[0]?.supportedRounds).toEqual([
      "hr",
      "firstBusiness",
      "technical",
      "manager",
      "final",
      "comprehensive",
    ])
    expect(page.setup).toMatchObject({
      availability: { status: "available" },
      availableDifficulties: ["basic", "pressure"],
      availableDurationMinutes: [15, 30, 45],
      defaultConfiguration: {
        targetRoleId: "active",
        round: "technical",
        difficulty: "pressure",
        durationMinutes: 30,
      },
    })
    vi.mocked(getRoles).mockResolvedValue({ ...roles, activeTargetRoleId: "missing" })
    expect((await getInterviewPage()).setup.defaultConfiguration.targetRoleId).toBe("first")
    const session = {
      status: "opening" as const,
      sessionId: interviewFixture.sessionId,
      configuration: interviewFixture.configuration,
      progress: interviewFixture.progress,
      openingMessage: interviewFixture.openingMessage,
    }
    vi.mocked(interviewFaker.get).mockReturnValue(session)
    expect((await getInterviewPage()).session).toEqual(session)
  })

  it.each([
    [[], false, "available", undefined],
    [roles.targetRoles, false, "blocked", "profileIncomplete"],
    [
      roles.targetRoles.filter(({ id }) => id === "missing"),
      true,
      "blocked",
      "jobDescriptionMissing",
    ],
  ] as const)(
    "preserves empty and prerequisite availability",
    async (items, complete, status, reason) => {
      vi.mocked(getRoles).mockResolvedValue({
        ...roles,
        targetRoles: [...items],
      })
      vi.mocked(getProfile).mockResolvedValue(complete ? careerProfileFixture : null)
      const page = await getInterviewPage()
      expect(page.setup.availability).toEqual({ status, ...(reason ? { reason } : {}) })
      if (page.setup.targetRoles.length === 0)
        expect(page.setup.defaultConfiguration.targetRoleId).toBeNull()
    },
  )

  it.each([
    ["active", true, undefined],
    ["archived", true, "targetRoleArchived"],
    ["deleted", true, "targetRoleDeleted"],
    ["missing", true, "targetRolePrerequisiteUnavailable"],
    ["active", false, "targetRolePrerequisiteUnavailable"],
  ] as const)(
    "prepares history for %s without changing the session",
    async (targetRoleId, complete, reason) => {
      vi.mocked(getRoles).mockResolvedValue(roles)
      vi.mocked(getProfile).mockResolvedValue(
        complete ? careerProfileFixture : { ...careerProfileFixture, skills: [] },
      )
      vi.mocked(interviewFaker.get).mockRestore()
      interviewFaker.start(interviewFixture.configuration)
      const before = interviewFaker.get()
      const start = vi.spyOn(interviewFaker, "start")
      const response = await prepareInterviewTrainingEntry({
        targetRoleId,
        round: "hr",
        difficulty: "basic",
        durationMinutes: 45,
      })
      expect(response.resolution).toMatchObject(
        reason
          ? { status: "roleUnavailable", reason }
          : {
              status: "available",
              configuration: {
                targetRoleId,
                round: "hr",
                difficulty: "basic",
                durationMinutes: 45,
              },
            },
      )
      expect(response.page.session).toBeNull()
      expect(response.page.setup.defaultConfiguration).toEqual(response.resolution.configuration)
      expect(interviewFaker.get()).toEqual(before)
      expect(start).not.toHaveBeenCalled()
    },
  )

  it("only exposes review for the completed session matching the route", async () => {
    const review = vi
      .spyOn(interviewFaker, "getReview")
      .mockReturnValue(structuredClone(interviewFixture.review))
    expect(await getInterviewReview("other")).toBeNull()
    vi.mocked(interviewFaker.get).mockReturnValue({
      status: "completed",
      sessionId: "current",
      history: [],
    })
    expect(await getInterviewReview("other")).toBeNull()
    expect(review).not.toHaveBeenCalled()
    expect(await getInterviewReview("current")).toEqual(interviewFixture.review)
  })
})
