import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetProfileMockState } from "@/mocks/services/profile"
import {
  applyResumeImportDraft,
  getResumeImportDraft,
  getResumeParsingStatus,
  startResumeParsing,
  uploadResume,
} from "@/services/profile"

describe("resume profile service in mock mode", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    resetProfileMockState("noProfile")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync()
    return promise
  }

  it("continues through the existing mock upload and parsing service without fetch", async () => {
    const uploaded = await settle(uploadResume({ text: "Resume text" }))
    expect(uploaded).toMatchObject({
      extractionStatus: "pending",
      sourceType: "pastedText",
    })

    const started = await settle(startResumeParsing(uploaded.id))
    expect(started).toMatchObject({ resumeDocumentId: uploaded.id, status: "running" })

    const completed = await settle(getResumeParsingStatus(uploaded.id))
    expect(completed).toMatchObject({ resumeDocumentId: uploaded.id, status: "succeeded" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not make a real request for import operations while the existing mock flow is active", async () => {
    await expect(getResumeImportDraft("resume_1")).rejects.toThrow("profile mock")
    await expect(applyResumeImportDraft("resume_1", 1)).rejects.toThrow("profile mock")

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
