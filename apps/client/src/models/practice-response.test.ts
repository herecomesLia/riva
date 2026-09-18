import { describe, expect, it } from "vitest"
import type { RoleListResponse } from "@/api/generated/models"
import { practiceFixture } from "@/mocks/fixtures/practice"
import { roleFixture } from "@/mocks/fixtures/role"
import { toPracticeSetupContext, toPracticeSetupSelection } from "./practice-response"
import { resolvePracticeTrainingEntry } from "./training-entry"

const roles: RoleListResponse = {
  roles: ["first", "active", "archived"].map((id) => ({
    ...structuredClone(roleFixture),
    id,
    isArchived: id === "archived",
  })),
  activeRoleId: "active",
}

describe("Practice setup projection", () => {
  it("derives available roles and preserves an available selection", () => {
    const context = toPracticeSetupContext(roles)
    expect(context.roles.map((role) => role.id)).toEqual(["first", "active"])
    expect(context.roles[0].supportedQuestionTypes).toEqual([
      "project",
      "behavioral",
      "business_understanding",
      "motivation",
      "technical_basics",
    ])
    expect(context.availableDifficulties).toEqual(["basic", "hard"])
    expect(toPracticeSetupSelection(roles)).toEqual({
      ...practiceFixture.selection,
      roleId: "active",
    })
    expect(
      toPracticeSetupSelection(roles, { ...practiceFixture.selection, roleId: "first" }).roleId,
    ).toBe("first")
    expect(toPracticeSetupSelection({ ...roles, activeRoleId: "archived" }).roleId).toBe("first")
    expect(toPracticeSetupSelection({ ...roles, roles: [] }).roleId).toBeNull()
  })
  it.each([
    ["first", "available", undefined],
    ["archived", "roleUnavailable", "roleArchived"],
    ["deleted", "roleUnavailable", "roleDeleted"],
  ] as const)("resolves history setup for %s", (roleId, status, reason) => {
    const response = resolvePracticeTrainingEntry(
      toPracticeSetupContext(roles),
      toPracticeSetupSelection(roles),
      { roleId },
      reason ? { status: "unavailable", reason } : { status: "available" },
    )
    expect(response).toMatchObject({ status, ...(reason ? { reason } : {}) })
    expect(response.configuration.roleId).toBe(reason ? null : roleId)
  })
})
