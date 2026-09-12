import { beforeEach, describe, expect, it, vi } from "vitest"
import { practiceFaker } from "@/mocks/fakers/practice"
import { practiceFixture } from "@/mocks/fixtures/practice"
import { roleFixture } from "@/mocks/fixtures/role"
import type { RoleListResponse } from "@/api/generated/models"
import { getRoles } from "@/services/roles"
import { getPracticePage, preparePracticeTrainingEntry } from "@/services/practice"

vi.mock("@/services/roles", () => ({ getRoles: vi.fn() }))

const roles: RoleListResponse = {
  roles: ["first", "active", "archived"].map((id) => ({
    ...structuredClone(roleFixture),
    id,
    isArchived: id === "archived",
  })),
  activeRoleId: "active",
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
    expect(page.setupContext.roles.map((role) => role.id)).toEqual(["first", "active"])
    expect(page.setupContext.roles[0]).toMatchObject({
      title: roleFixture.title,
      company: roleFixture.company,
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
      selection: { ...practiceFixture.selection, roleId: "active" },
    })
    vi.mocked(practiceFaker.get).mockResolvedValue({
      status: "setup",
      selection: { ...practiceFixture.selection, roleId: "first" },
    })
    expect((await getPracticePage()).session).toMatchObject({
      selection: { roleId: "first" },
    })
    vi.mocked(practiceFaker.get).mockResolvedValue({
      status: "setup",
      selection: { ...practiceFixture.selection, roleId: "deleted" },
    })
    vi.mocked(getRoles).mockResolvedValue({ ...roles, activeRoleId: "archived" })
    expect((await getPracticePage()).session).toMatchObject({
      selection: { roleId: "first" },
    })
    vi.mocked(getRoles).mockResolvedValue({ ...roles, roles: [] })
    expect((await getPracticePage()).session).toMatchObject({ selection: { roleId: null } })

    const session = {
      status: "generatingQuestion" as const,
      selection: { ...practiceFixture.selection, roleId: "active" },
    }
    vi.mocked(practiceFaker.get).mockResolvedValue(session)
    expect((await getPracticePage()).session).toEqual(session)
  })

  it.each([
    ["first", "available", undefined],
    ["archived", "roleUnavailable", "roleArchived"],
    ["deleted", "roleUnavailable", "roleDeleted"],
  ] as const)("resolves history entry for %s into setup data", async (roleId, status, reason) => {
    const response = await preparePracticeTrainingEntry({ roleId, source: "history" })
    expect(response.resolution).toMatchObject({ status, ...(reason ? { reason } : {}) })
    expect(response.page.session).toEqual({
      status: "setup",
      selection: response.resolution.configuration,
    })
    expect(practiceFaker.get).toHaveBeenCalledOnce()
  })
})
