import { getCareerProfile } from "@/services/profile"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import { createRoleStoryResponse } from "@/pages/roles/stories/role-story-fixtures"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { interviewFaker } from "@/mocks/fakers/interview"
import { interviewFixture } from "@/mocks/fixtures/interview"
import { roleFixture } from "@/mocks/fixtures/role"
import type { RoleListResponse } from "@/api/generated/models"
import { listRoles, getJdExtractionState } from "@/services/roles"
import {
  getInterviewPage,
  getInterviewReview,
  prepareInterviewTrainingEntry,
} from "@/services/interview"

vi.mock("@/services/roles", () => ({ listRoles: vi.fn(), getJdExtractionState: vi.fn() }))
vi.mock("@/services/profile", () => ({ getCareerProfile: vi.fn() }))

const roles: RoleListResponse = {
  roles: ["first", "active", "missing", "archived"].map((id) => ({
    ...structuredClone(roleFixture),
    id,
    isArchived: id === "archived",
    jd:
      id === "missing"
        ? createRoleStoryResponse("singleRoleWithoutJobDescription").roles[0]!.jd
        : roleFixture.jd,
  })),
  activeRoleId: "active",
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.mocked(getCareerProfile).mockResolvedValue(careerProfileFixture)
  vi.mocked(getJdExtractionState).mockResolvedValue({ status: "idle", error: null })
  vi.mocked(listRoles).mockResolvedValue(structuredClone(roles))
  vi.spyOn(interviewFaker, "get").mockReturnValue(null)
})

describe("Interview service", () => {
  it("combines ready roles, defaults and the current session", async () => {
    const page = await getInterviewPage()
    expect(page.session).toBeNull()
    expect(page.setup.roles.map(({ id }) => id)).toEqual(["first", "active"])
    expect(page.setup.roles[0]?.supportedRounds).toEqual([
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
        roleId: "active",
        round: "technical",
        difficulty: "pressure",
        durationMinutes: 30,
      },
    })
    vi.mocked(listRoles).mockResolvedValue({ ...roles, activeRoleId: "missing" })
    expect((await getInterviewPage()).setup.defaultConfiguration.roleId).toBe("first")
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
      vi.mocked(listRoles).mockResolvedValue({
        ...roles,
        roles: [...items],
      })
      vi.mocked(getCareerProfile).mockResolvedValue(complete ? careerProfileFixture : null)
      const page = await getInterviewPage()
      expect(page.setup.availability).toEqual({ status, ...(reason ? { reason } : {}) })
      if (page.setup.roles.length === 0) expect(page.setup.defaultConfiguration.roleId).toBeNull()
    },
  )

  it.each([
    ["active", true, undefined],
    ["archived", true, "roleArchived"],
    ["deleted", true, "roleDeleted"],
    ["missing", true, "rolePrerequisiteUnavailable"],
    ["active", false, "rolePrerequisiteUnavailable"],
  ] as const)(
    "prepares history for %s without changing the session",
    async (roleId, complete, reason) => {
      vi.mocked(listRoles).mockResolvedValue(roles)
      vi.mocked(getCareerProfile).mockResolvedValue(
        complete ? careerProfileFixture : { ...careerProfileFixture, skills: [] },
      )
      vi.mocked(interviewFaker.get).mockRestore()
      interviewFaker.start(interviewFixture.configuration)
      const before = interviewFaker.get()
      const start = vi.spyOn(interviewFaker, "start")
      const response = await prepareInterviewTrainingEntry({
        roleId,
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
                roleId,
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
