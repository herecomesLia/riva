import { beforeEach, describe, expect, it, vi } from "vitest"
import { practiceFaker } from "@/mocks/fakers/practice"
import { practiceFixture } from "@/mocks/fixtures/practice"
import { targetRoleFixture } from "@/mocks/fixtures/target-role"
import type { TargetRoleListResponse } from "@/api/generated/models"
import { getRoles } from "@/services/roles"
import { getPracticePage, preparePracticeTrainingEntry } from "@/services/practice"

vi.mock("@/services/roles", () => ({ getRoles: vi.fn() }))

const roles: TargetRoleListResponse = {
  targetRoles: ["first", "active", "archived"].map((id) => ({
    ...structuredClone(targetRoleFixture),
    id,
    isArchived: id === "archived",
  })),
  activeTargetRoleId: "active",
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.mocked(getRoles).mockResolvedValue(structuredClone(roles))
  vi.spyOn(practiceFaker, "get").mockResolvedValue({
    status: "setup",
    selection: structuredClone(practiceFixture.selection),
  })
})

describe("Practice service", () => {
  it("combines formal roles and the session with an available default role", async () => {
    const page = await getPracticePage()
    expect(page.setupContext.targetRoles.map((role) => role.id)).toEqual(["first", "active"])
    expect(page.setupContext.targetRoles[0]).toMatchObject({
      title: targetRoleFixture.title,
      company: targetRoleFixture.company,
      supportedQuestionTypes: [
        "projectDeepDive",
        "behavioral",
        "businessUnderstanding",
        "motivation",
        "technicalFoundation",
      ],
    })
    expect(page.setupContext).toMatchObject({
      availableDifficulties: ["basic", "pressure"],
      eligibleQuestionCounts: { saved: 1, history: 1 },
    })
    expect(page.session).toEqual({
      status: "setup",
      selection: { ...practiceFixture.selection, targetRoleId: "active" },
    })
    vi.mocked(practiceFaker.get).mockResolvedValue({
      status: "setup",
      selection: { ...practiceFixture.selection, targetRoleId: "first" },
    })
    expect((await getPracticePage()).session).toMatchObject({
      selection: { targetRoleId: "first" },
    })
    vi.mocked(practiceFaker.get).mockResolvedValue({
      status: "setup",
      selection: { ...practiceFixture.selection, targetRoleId: "deleted" },
    })
    vi.mocked(getRoles).mockResolvedValue({ ...roles, activeTargetRoleId: "archived" })
    expect((await getPracticePage()).session).toMatchObject({
      selection: { targetRoleId: "first" },
    })
    vi.mocked(getRoles).mockResolvedValue({ ...roles, targetRoles: [] })
    expect((await getPracticePage()).session).toMatchObject({ selection: { targetRoleId: null } })

    const session = {
      status: "generatingQuestion" as const,
      selection: { ...practiceFixture.selection, targetRoleId: "active" },
    }
    vi.mocked(practiceFaker.get).mockResolvedValue(session)
    expect((await getPracticePage()).session).toEqual(session)
  })

  it.each([
    ["first", "available", undefined],
    ["archived", "roleUnavailable", "targetRoleArchived"],
    ["deleted", "roleUnavailable", "targetRoleDeleted"],
  ] as const)(
    "resolves history entry for %s into setup data",
    async (targetRoleId, status, reason) => {
      const response = await preparePracticeTrainingEntry({ targetRoleId, source: "history" })
      expect(response.resolution).toMatchObject({ status, ...(reason ? { reason } : {}) })
      expect(response.page.session).toEqual({
        status: "setup",
        selection: response.resolution.configuration,
      })
      expect(practiceFaker.get).toHaveBeenCalledOnce()
    },
  )
})
