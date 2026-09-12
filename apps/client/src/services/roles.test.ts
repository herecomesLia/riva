import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  archiveRole as apiArchiveRole,
  createRole as apiCreateRole,
  deleteRole as apiDeleteRole,
  listRoles,
  restoreRole as apiRestoreRole,
  setActiveRole as apiSetActiveRole,
  updateRole as apiUpdateRole,
  updateJd as updateJdRequest,
  extractJdFromText,
  getJdExtractionState as getJdExtractionStateRequest,
  retryJdExtraction as retryJdExtractionRequest,
  abortJdExtraction as abortJdExtractionRequest,
} from "@/api/generated/endpoints/roles/roles"
import { matchResultFixture, roleListFixture, roleFixture } from "@/mocks/fixtures/role"
import { roleFaker } from "@/mocks/fakers/role"
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

vi.mock("@/api/generated/endpoints/roles/roles", () => ({
  archiveRole: vi.fn(),
  createRole: vi.fn(),
  deleteRole: vi.fn(),
  listRoles: vi.fn(),
  restoreRole: vi.fn(),
  setActiveRole: vi.fn(),
  updateRole: vi.fn(),
  updateJd: vi.fn(),
  extractJdFromText: vi.fn(),
  getJdExtractionState: vi.fn(),
  retryJdExtraction: vi.fn(),
  abortJdExtraction: vi.fn(),
}))

vi.mock("@/mocks/fakers/role", () => ({
  roleFaker: {
    clear: vi.fn(),
    getMatch: vi.fn(),
    match: vi.fn(),
    recognizeRole: vi.fn(),
    staleMatch: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listRoles).mockResolvedValue(structuredClone(roleListFixture))
  vi.mocked(getJdExtractionStateRequest).mockResolvedValue({ status: "idle", error: null })
  vi.mocked(roleFaker.getMatch).mockResolvedValue({ status: "none" })
})

describe("roles service", () => {
  it("returns the formal list without aggregating workflow resources", async () => {
    await expect(getRoles()).resolves.toEqual(roleListFixture)
    expect(listRoles).toHaveBeenCalledOnce()
    expect(getJdExtractionStateRequest).not.toHaveBeenCalled()
    expect(roleFaker.getMatch).not.toHaveBeenCalled()
  })

  it("delegates formal role writes to generated operations", async () => {
    const createInput = { title: "Platform Engineer" }
    const updateInput = { title: "Senior Platform Engineer" }
    vi.mocked(apiCreateRole).mockResolvedValue(roleFixture)
    vi.mocked(apiUpdateRole).mockResolvedValue(roleFixture)
    vi.mocked(apiSetActiveRole).mockResolvedValue(undefined)
    vi.mocked(apiArchiveRole).mockResolvedValue(roleFixture)
    vi.mocked(apiRestoreRole).mockResolvedValue(roleFixture)
    vi.mocked(apiDeleteRole).mockResolvedValue(undefined)

    await createRole(createInput)
    await updateRole(roleFixture.id, updateInput)
    await setActiveRole(roleFixture.id)
    await archiveRole(roleFixture.id)
    await restoreRole(roleFixture.id)
    await deleteRole(roleFixture.id)

    expect(apiCreateRole).toHaveBeenCalledWith(createInput)
    expect(apiUpdateRole).toHaveBeenCalledWith(roleFixture.id, updateInput)
    expect(apiSetActiveRole).toHaveBeenCalledWith({ roleId: roleFixture.id })
    expect(apiArchiveRole).toHaveBeenCalledWith(roleFixture.id)
    expect(apiRestoreRole).toHaveBeenCalledWith(roleFixture.id)
    expect(apiDeleteRole).toHaveBeenCalledWith(roleFixture.id)
    expect(roleFaker.clear).toHaveBeenCalledWith(roleFixture.id)
  })

  it("keeps workflow state when formal role deletion fails", async () => {
    vi.mocked(apiDeleteRole).mockRejectedValue(new Error("request failed"))

    await expect(deleteRole(roleFixture.id)).rejects.toThrow("request failed")
    expect(roleFaker.clear).not.toHaveBeenCalled()
  })

  it.each([
    { sourceType: "text" as const, text: "Job posting" },
    { sourceType: "image" as const, images: [new File(["posting"], "posting.png")] },
    { sourceType: "url" as const, url: "https://example.com/jobs/1" },
  ])("keeps $sourceType creation entirely behind the faker", async (input) => {
    vi.mocked(roleFaker.recognizeRole).mockResolvedValue(roleFixture)
    await expect(recognizeRole(input)).resolves.toBe(roleFixture)
    expect(roleFaker.recognizeRole).toHaveBeenCalledWith(input)
    expect(apiCreateRole).not.toHaveBeenCalled()
    expect(extractJdFromText).not.toHaveBeenCalled()
  })

  it("delegates extraction lifecycle to generated operations and invalidates matching after accepted writes", async () => {
    await extractJd(roleFixture.id, "JD text")
    await retryJdExtraction(roleFixture.id)
    await abortJdExtraction(roleFixture.id)
    await getJdExtractionState(roleFixture.id)
    expect(extractJdFromText).toHaveBeenCalledWith(roleFixture.id, { text: "JD text" })
    expect(retryJdExtractionRequest).toHaveBeenCalledWith(roleFixture.id)
    expect(abortJdExtractionRequest).toHaveBeenCalledWith(roleFixture.id)
    expect(getJdExtractionStateRequest).toHaveBeenCalledWith(roleFixture.id, {
      signal: undefined,
    })
    expect(roleFaker.staleMatch).toHaveBeenCalledTimes(2)
    vi.mocked(roleFaker.match).mockResolvedValue({ status: "generating" })
    vi.mocked(roleFaker.getMatch).mockResolvedValue({
      status: "current",
      result: matchResultFixture,
    })
    await expect(match(roleFixture.id)).resolves.toEqual({ status: "generating" })
    await expect(getMatchingAnalysis(roleFixture.id)).resolves.toEqual({
      status: "current",
      result: matchResultFixture,
    })
  })

  it("marks matching stale after a direct structured-JD update", async () => {
    const input = { responsibilities: ["Updated responsibility"] }
    vi.mocked(updateJdRequest).mockResolvedValue(roleFixture)
    vi.mocked(roleFaker.staleMatch).mockResolvedValue(undefined)

    await expect(updateJd(roleFixture.id, input)).resolves.toBe(roleFixture)
    expect(updateJdRequest).toHaveBeenCalledWith(roleFixture.id, input)
    expect(roleFaker.staleMatch).toHaveBeenCalledWith(roleFixture.id)
  })
})
