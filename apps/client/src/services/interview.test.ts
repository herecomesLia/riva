import { beforeEach, describe, expect, it, vi } from "vitest"

import { interviewFaker } from "@/mocks/fakers/interview"
import { interviewFixture } from "@/mocks/fixtures/interview"
import { targetRoleFixture } from "@/mocks/fixtures/target-role"
import type { RolesData } from "@/models/target-role-workflow"
import { getRoles } from "@/services/roles"
import {
  getInterviewPage,
  getInterviewReview,
  prepareInterviewTrainingEntry,
} from "@/services/interview"

vi.mock("@/services/roles", () => ({ getRoles: vi.fn() }))

const roles: RolesData = {
  roles: ["first", "active", "missing", "archived"].map((id) => ({
    ...structuredClone(targetRoleFixture),
    id,
    isArchived: id === "archived",
    jdState:
      id === "missing" ? { status: "missing" } : { status: "ready", result: targetRoleFixture.jd },
    matchState: { status: "none" },
  })),
  activeRoleId: "active",
  profile: { exists: true, complete: true },
}

beforeEach(() => {
  vi.restoreAllMocks()
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
    vi.mocked(getRoles).mockResolvedValue({ ...roles, activeRoleId: "missing" })
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
    [roles.roles, false, "blocked", "profileIncomplete"],
    [roles.roles.filter(({ id }) => id === "missing"), true, "blocked", "jobDescriptionMissing"],
  ] as const)(
    "preserves empty and prerequisite availability",
    async (items, complete, status, reason) => {
      vi.mocked(getRoles).mockResolvedValue({
        ...roles,
        roles: [...items],
        profile: { exists: complete, complete },
      })
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
      vi.mocked(getRoles).mockResolvedValue({ ...roles, profile: { exists: true, complete } })
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
