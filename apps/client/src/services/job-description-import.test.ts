import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createJobDescriptionImportDraftFixture } from "@/mocks/data/job-description-import"
import {
  applyJobDescriptionImportDraft,
  createJobDescriptionImportDraft,
  getJobDescriptionImportDraft,
} from "@/services/job-description-import"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

function requestJson(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const body = fetchMock.mock.calls[0]?.[1]?.body
  if (typeof body !== "string") throw new TypeError("Expected a JSON request body.")
  return JSON.parse(body) as unknown
}

describe("job description import service", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("creates an import draft with the JD text", async () => {
    const draft = createJobDescriptionImportDraftFixture("parsing")
    fetchMock.mockResolvedValueOnce(jsonResponse(draft, 202))

    const result = await createJobDescriptionImportDraft({ rawText: draft.rawText })

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/job-description-import-drafts")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "POST",
    })
    expect(requestJson(fetchMock)).toEqual({ rawText: draft.rawText })
    expect(result).toEqual(draft)
  })

  it("gets the current draft status for polling", async () => {
    const draft = createJobDescriptionImportDraftFixture("ready")
    fetchMock.mockResolvedValueOnce(jsonResponse(draft))

    const result = await getJobDescriptionImportDraft(draft.id)

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/job-description-import-drafts/${draft.id}`,
      expect.objectContaining({ credentials: "include" }),
    )
    expect(result.status).toBe("ready")
  })

  it("applies a ready draft without adding a request body", async () => {
    const ready = createJobDescriptionImportDraftFixture("ready")
    const applied = {
      ...ready,
      appliedRoleId: "30000000-0000-4000-8000-000000000001",
      canApply: false,
      status: "applied" as const,
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(applied))

    const result = await applyJobDescriptionImportDraft(ready.id)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/job-description-import-drafts/${ready.id}/apply`,
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "POST",
    })
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined()
    expect(result).toEqual(applied)
  })
})
