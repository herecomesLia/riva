import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  listTargetRoles,
  restoreTargetRole,
  setActiveTargetRole,
  updateTargetRole,
  updateTargetRoleJd,
} from "@/api/generated/endpoints/target-roles/target-roles"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import {
  matchResultFixture,
  parsedJdFixture,
  roleListFixture,
  targetRoleFixture,
  textRoleFixture,
} from "@/mocks/fixtures/target-role"
import { targetRoleFaker } from "@/mocks/fakers/target-role"
import { getProfile } from "@/services/profile"
import {
  archiveRole,
  createRole,
  deleteRole,
  getRoles,
  match,
  parseJd,
  pollJd,
  pollMatch,
  recognizeRole,
  restoreRole,
  setActiveRole,
  updateJd,
  updateRole,
} from "@/services/roles"

vi.mock("@/api/generated/endpoints/target-roles/target-roles", () => ({
  archiveTargetRole: vi.fn(),
  createTargetRole: vi.fn(),
  deleteTargetRole: vi.fn(),
  listTargetRoles: vi.fn(),
  restoreTargetRole: vi.fn(),
  setActiveTargetRole: vi.fn(),
  updateTargetRole: vi.fn(),
  updateTargetRoleJd: vi.fn(),
}))

vi.mock("@/mocks/fakers/target-role", () => ({
  targetRoleFaker: {
    clear: vi.fn(),
    getJd: vi.fn(),
    getMatch: vi.fn(),
    match: vi.fn(),
    parseJd: vi.fn(),
    pollJd: vi.fn(),
    pollMatch: vi.fn(),
    recognize: vi.fn(),
    staleMatch: vi.fn(),
  },
}))

vi.mock("@/services/profile", () => ({ getProfile: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listTargetRoles).mockResolvedValue(structuredClone(roleListFixture))
  vi.mocked(getProfile).mockResolvedValue(structuredClone(careerProfileFixture))
  vi.mocked(targetRoleFaker.getJd).mockImplementation(async (role) =>
    role.id === targetRoleFixture.id
      ? { status: "ready", result: structuredClone(role.jd) }
      : { status: "missing" },
  )
  vi.mocked(targetRoleFaker.getMatch).mockResolvedValue({ status: "none" })
})

describe("roles service", () => {
  it("combines generated roles, profile completeness, and read-only workflow state", async () => {
    const response = await getRoles()

    expect(response).toEqual({
      roles: [
        {
          ...targetRoleFixture,
          jdState: { status: "ready", result: targetRoleFixture.jd },
          matchState: { status: "none" },
        },
        {
          ...roleListFixture.targetRoles[1],
          jdState: { status: "missing" },
          matchState: { status: "none" },
        },
      ],
      activeRoleId: targetRoleFixture.id,
      profile: { exists: true, complete: true },
    })
    expect(targetRoleFaker.getJd).toHaveBeenCalledTimes(2)
    expect(targetRoleFaker.pollJd).not.toHaveBeenCalled()
    expect(targetRoleFaker.pollMatch).not.toHaveBeenCalled()
  })

  it("derives a missing profile without adding version state", async () => {
    vi.mocked(getProfile).mockResolvedValue(null)

    await expect(getRoles()).resolves.toMatchObject({
      profile: { exists: false, complete: false },
    })
  })

  it("delegates formal role writes to generated operations", async () => {
    const createInput = { title: "Platform Engineer" }
    const updateInput = { title: "Senior Platform Engineer" }
    vi.mocked(createTargetRole).mockResolvedValue(targetRoleFixture)
    vi.mocked(updateTargetRole).mockResolvedValue(targetRoleFixture)
    vi.mocked(setActiveTargetRole).mockResolvedValue(undefined)
    vi.mocked(archiveTargetRole).mockResolvedValue(targetRoleFixture)
    vi.mocked(restoreTargetRole).mockResolvedValue(targetRoleFixture)
    vi.mocked(deleteTargetRole).mockResolvedValue(undefined)

    await createRole(createInput)
    await updateRole(targetRoleFixture.id, updateInput)
    await setActiveRole(targetRoleFixture.id)
    await archiveRole(targetRoleFixture.id)
    await restoreRole(targetRoleFixture.id)
    await deleteRole(targetRoleFixture.id)

    expect(createTargetRole).toHaveBeenCalledWith(createInput)
    expect(updateTargetRole).toHaveBeenCalledWith(targetRoleFixture.id, updateInput)
    expect(setActiveTargetRole).toHaveBeenCalledWith({ targetRoleId: targetRoleFixture.id })
    expect(archiveTargetRole).toHaveBeenCalledWith(targetRoleFixture.id)
    expect(restoreTargetRole).toHaveBeenCalledWith(targetRoleFixture.id)
    expect(deleteTargetRole).toHaveBeenCalledWith(targetRoleFixture.id)
    expect(targetRoleFaker.clear).toHaveBeenCalledWith(targetRoleFixture.id)
  })

  it("keeps workflow state when formal role deletion fails", async () => {
    vi.mocked(deleteTargetRole).mockRejectedValue(new Error("request failed"))

    await expect(deleteRole(targetRoleFixture.id)).rejects.toThrow("request failed")
    expect(targetRoleFaker.clear).not.toHaveBeenCalled()
  })

  it("recognizes fixture data, creates the formal role, and starts JD parsing", async () => {
    const input = { sourceType: "text", text: "Unstored source text" } as const
    vi.mocked(targetRoleFaker.recognize).mockResolvedValue(textRoleFixture)
    vi.mocked(createTargetRole).mockResolvedValue(targetRoleFixture)
    vi.mocked(targetRoleFaker.parseJd).mockResolvedValue({ status: "parsing" })

    await expect(recognizeRole(input)).resolves.toBe(targetRoleFixture)
    expect(createTargetRole).toHaveBeenCalledWith(textRoleFixture)
    expect(targetRoleFaker.parseJd).toHaveBeenCalledWith(targetRoleFixture.id, input.text)
  })

  it("persists a completed JD poll through the generated API", async () => {
    const role = {
      ...targetRoleFixture,
      jdState: { status: "parsing" as const },
      matchState: { status: "none" as const },
    }
    const updatedRole = { ...targetRoleFixture, updatedAt: "2026-08-02T08:00:00Z" }
    vi.mocked(targetRoleFaker.pollJd).mockResolvedValue({
      status: "ready",
      result: parsedJdFixture,
    })
    vi.mocked(updateTargetRoleJd).mockResolvedValue(updatedRole)

    await expect(pollJd(role)).resolves.toEqual({
      ...updatedRole,
      jdState: { status: "ready", result: parsedJdFixture },
      matchState: { status: "none" },
    })
    expect(updateTargetRoleJd).toHaveBeenCalledWith(role.id, parsedJdFixture)
  })

  it("does not write formal JD data when polling has not completed", async () => {
    const role = {
      ...targetRoleFixture,
      jdState: { status: "parsing" as const },
      matchState: { status: "none" as const },
    }
    vi.mocked(targetRoleFaker.pollJd).mockResolvedValue({ status: "parsing" })

    await expect(pollJd(role)).resolves.toMatchObject({ jdState: { status: "parsing" } })
    expect(updateTargetRoleJd).not.toHaveBeenCalled()
  })

  it("keeps API-less workflows behind the Faker boundary", async () => {
    vi.mocked(targetRoleFaker.parseJd).mockResolvedValue({ status: "parsing" })
    vi.mocked(targetRoleFaker.match).mockResolvedValue({ status: "generating" })
    vi.mocked(targetRoleFaker.pollMatch).mockResolvedValue({
      status: "current",
      result: matchResultFixture,
    })

    await expect(parseJd(targetRoleFixture.id, "JD text")).resolves.toEqual({
      status: "parsing",
    })
    await expect(match(targetRoleFixture.id)).resolves.toEqual({ status: "generating" })
    await expect(pollMatch(targetRoleFixture.id)).resolves.toEqual({
      status: "current",
      result: matchResultFixture,
    })
  })

  it("marks matching stale after a direct structured-JD update", async () => {
    const input = { responsibilities: ["Updated responsibility"] }
    vi.mocked(updateTargetRoleJd).mockResolvedValue(targetRoleFixture)
    vi.mocked(targetRoleFaker.staleMatch).mockResolvedValue(undefined)

    await expect(updateJd(targetRoleFixture.id, input)).resolves.toBe(targetRoleFixture)
    expect(updateTargetRoleJd).toHaveBeenCalledWith(targetRoleFixture.id, input)
    expect(targetRoleFaker.staleMatch).toHaveBeenCalledWith(targetRoleFixture.id)
  })
})
