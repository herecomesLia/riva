import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  listTargetRoles,
  restoreTargetRole,
  setActiveTargetRole,
  updateTargetRole,
  updateJd as updateJdRequest,
  extractJdFromText,
  getJdExtractionState as getJdExtractionStateRequest,
  retryJdExtraction as retryJdExtractionRequest,
  abortJdExtraction as abortJdExtractionRequest,
} from "@/api/generated/endpoints/target-roles/target-roles"
import {
  matchResultFixture,
  roleListFixture,
  targetRoleFixture,
} from "@/mocks/fixtures/target-role"
import { targetRoleFaker } from "@/mocks/fakers/target-role"
import {
  archiveRole,
  createRole,
  deleteRole,
  getRoles,
  match,
  extractJd,
  getJdExtractionState,
  retryJdExtraction,
  abortJdExtraction,
  getMatchingAnalysis,
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
  updateJd: vi.fn(),
  extractJdFromText: vi.fn(),
  getJdExtractionState: vi.fn(),
  retryJdExtraction: vi.fn(),
  abortJdExtraction: vi.fn(),
}))

vi.mock("@/mocks/fakers/target-role", () => ({
  targetRoleFaker: {
    clear: vi.fn(),
    getMatch: vi.fn(),
    match: vi.fn(),
    recognizeRole: vi.fn(),
    staleMatch: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listTargetRoles).mockResolvedValue(structuredClone(roleListFixture))
  vi.mocked(getJdExtractionStateRequest).mockResolvedValue({ status: "idle", error: null })
  vi.mocked(targetRoleFaker.getMatch).mockResolvedValue({ status: "none" })
})

describe("roles service", () => {
  it("returns the formal list without aggregating workflow resources", async () => {
    await expect(getRoles()).resolves.toEqual(roleListFixture)
    expect(listTargetRoles).toHaveBeenCalledOnce()
    expect(getJdExtractionStateRequest).not.toHaveBeenCalled()
    expect(targetRoleFaker.getMatch).not.toHaveBeenCalled()
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

  it.each([
    { sourceType: "text" as const, text: "Job posting" },
    { sourceType: "image" as const, images: [new File(["posting"], "posting.png")] },
    { sourceType: "url" as const, url: "https://example.com/jobs/1" },
  ])("keeps $sourceType creation entirely behind the faker", async (input) => {
    vi.mocked(targetRoleFaker.recognizeRole).mockResolvedValue(targetRoleFixture)
    await expect(recognizeRole(input)).resolves.toBe(targetRoleFixture)
    expect(targetRoleFaker.recognizeRole).toHaveBeenCalledWith(input)
    expect(createTargetRole).not.toHaveBeenCalled()
    expect(extractJdFromText).not.toHaveBeenCalled()
  })

  it("delegates extraction lifecycle to generated operations and invalidates matching after accepted writes", async () => {
    await extractJd(targetRoleFixture.id, "JD text")
    await retryJdExtraction(targetRoleFixture.id)
    await abortJdExtraction(targetRoleFixture.id)
    await getJdExtractionState(targetRoleFixture.id)
    expect(extractJdFromText).toHaveBeenCalledWith(targetRoleFixture.id, { text: "JD text" })
    expect(retryJdExtractionRequest).toHaveBeenCalledWith(targetRoleFixture.id)
    expect(abortJdExtractionRequest).toHaveBeenCalledWith(targetRoleFixture.id)
    expect(getJdExtractionStateRequest).toHaveBeenCalledWith(targetRoleFixture.id, {
      signal: undefined,
    })
    expect(targetRoleFaker.staleMatch).toHaveBeenCalledTimes(2)
    vi.mocked(targetRoleFaker.match).mockResolvedValue({ status: "generating" })
    vi.mocked(targetRoleFaker.getMatch).mockResolvedValue({
      status: "current",
      result: matchResultFixture,
    })
    await expect(match(targetRoleFixture.id)).resolves.toEqual({ status: "generating" })
    await expect(getMatchingAnalysis(targetRoleFixture.id)).resolves.toEqual({
      status: "current",
      result: matchResultFixture,
    })
  })

  it("marks matching stale after a direct structured-JD update", async () => {
    const input = { responsibilities: ["Updated responsibility"] }
    vi.mocked(updateJdRequest).mockResolvedValue(targetRoleFixture)
    vi.mocked(targetRoleFaker.staleMatch).mockResolvedValue(undefined)

    await expect(updateJd(targetRoleFixture.id, input)).resolves.toBe(targetRoleFixture)
    expect(updateJdRequest).toHaveBeenCalledWith(targetRoleFixture.id, input)
    expect(targetRoleFaker.staleMatch).toHaveBeenCalledWith(targetRoleFixture.id)
  })
})
