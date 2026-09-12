import { beforeEach, describe, expect, it, vi } from "vitest"

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

const rolesApi = vi.hoisted(() => ({
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

vi.mock("@/api/generated/endpoints/roles/roles", () => ({
  getRolesApi: () => rolesApi,
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
  vi.mocked(rolesApi.listRoles).mockResolvedValue(structuredClone(roleListFixture))
  vi.mocked(rolesApi.getJdExtractionState).mockResolvedValue({ status: "idle", error: null })
  vi.mocked(roleFaker.getMatch).mockResolvedValue({ status: "none" })
})

describe("roles service", () => {
  it("returns the formal list without aggregating workflow resources", async () => {
    await expect(getRoles()).resolves.toEqual(roleListFixture)
    expect(rolesApi.listRoles).toHaveBeenCalledOnce()
    expect(rolesApi.getJdExtractionState).not.toHaveBeenCalled()
    expect(roleFaker.getMatch).not.toHaveBeenCalled()
  })

  it("delegates formal role writes to generated operations", async () => {
    const createInput = { title: "Platform Engineer" }
    const updateInput = { title: "Senior Platform Engineer" }
    vi.mocked(rolesApi.createRole).mockResolvedValue(roleFixture)
    vi.mocked(rolesApi.updateRole).mockResolvedValue(roleFixture)
    vi.mocked(rolesApi.setActiveRole).mockResolvedValue(undefined)
    vi.mocked(rolesApi.archiveRole).mockResolvedValue(roleFixture)
    vi.mocked(rolesApi.restoreRole).mockResolvedValue(roleFixture)
    vi.mocked(rolesApi.deleteRole).mockResolvedValue(undefined)

    await createRole(createInput)
    await updateRole(roleFixture.id, updateInput)
    await setActiveRole(roleFixture.id)
    await archiveRole(roleFixture.id)
    await restoreRole(roleFixture.id)
    await deleteRole(roleFixture.id)

    expect(rolesApi.createRole).toHaveBeenCalledWith(createInput)
    expect(rolesApi.updateRole).toHaveBeenCalledWith(roleFixture.id, updateInput)
    expect(rolesApi.setActiveRole).toHaveBeenCalledWith({ roleId: roleFixture.id })
    expect(rolesApi.archiveRole).toHaveBeenCalledWith(roleFixture.id)
    expect(rolesApi.restoreRole).toHaveBeenCalledWith(roleFixture.id)
    expect(rolesApi.deleteRole).toHaveBeenCalledWith(roleFixture.id)
    expect(roleFaker.clear).toHaveBeenCalledWith(roleFixture.id)
  })

  it("keeps workflow state when formal role deletion fails", async () => {
    vi.mocked(rolesApi.deleteRole).mockRejectedValue(new Error("request failed"))

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
    expect(rolesApi.createRole).not.toHaveBeenCalled()
    expect(rolesApi.extractJdFromText).not.toHaveBeenCalled()
  })

  it("delegates extraction lifecycle to generated operations and invalidates matching after accepted writes", async () => {
    await extractJd(roleFixture.id, "JD text")
    await retryJdExtraction(roleFixture.id)
    await abortJdExtraction(roleFixture.id)
    await getJdExtractionState(roleFixture.id)
    expect(rolesApi.extractJdFromText).toHaveBeenCalledWith(roleFixture.id, { text: "JD text" })
    expect(rolesApi.retryJdExtraction).toHaveBeenCalledWith(roleFixture.id)
    expect(rolesApi.abortJdExtraction).toHaveBeenCalledWith(roleFixture.id)
    expect(rolesApi.getJdExtractionState).toHaveBeenCalledWith(roleFixture.id, {
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
    vi.mocked(rolesApi.updateJd).mockResolvedValue(roleFixture)
    vi.mocked(roleFaker.staleMatch).mockResolvedValue(undefined)

    await expect(updateJd(roleFixture.id, input)).resolves.toBe(roleFixture)
    expect(rolesApi.updateJd).toHaveBeenCalledWith(roleFixture.id, input)
    expect(roleFaker.staleMatch).toHaveBeenCalledWith(roleFixture.id)
  })
})
