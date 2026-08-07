import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

import {
  applyResumeImportDraft,
  getResumeImportDraft,
  getResumeParsingStatus,
  retryResumeParsing,
  startResumeParsing,
  uploadResume,
} from "@/services/profile"
import { ApiError } from "@/services/api"

const resumeId = "11111111-1111-4111-8111-111111111111"
const runId = "22222222-2222-4222-8222-222222222222"
const profileId = "33333333-3333-4333-8333-333333333333"
const skillId = "44444444-4444-4444-8444-444444444444"
const timestamp = "2026-08-06T12:00:00Z"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

function documentResponse(
  extractionStatus: "pending" | "succeeded" | "failed" = "pending",
): Record<string, unknown> {
  return {
    byteSize: 10,
    extractedAt: extractionStatus === "pending" ? null : timestamp,
    extractionStatus,
    failureReason: extractionStatus === "failed" ? "The text layer is unavailable." : null,
    id: resumeId,
    mediaType: "application/pdf",
    originalFilename: "resume.pdf",
    sourceType: "file",
    uploadedAt: timestamp,
  }
}

function parsingResponse(
  status: "notStarted" | "queued" | "running" | "succeeded" | "failed",
): Record<string, unknown> {
  const active = status !== "notStarted"
  const terminal = status === "succeeded" || status === "failed"

  return {
    attemptCount: status === "notStarted" || status === "queued" ? 0 : 1,
    canRetry: status === "failed",
    createdAt: active ? timestamp : null,
    draftStatus: status === "succeeded" ? "ready" : null,
    draftVersion: status === "succeeded" ? 1 : null,
    errorCode: status === "failed" ? "resume_parsing_unavailable" : null,
    failureReason: status === "failed" ? "The provider is unavailable." : null,
    finishedAt: terminal ? timestamp : null,
    maxAttempts: active ? 3 : null,
    resultVersion: status === "succeeded" ? 1 : null,
    resumeDocumentId: resumeId,
    runId: active ? runId : null,
    startedAt: status === "queued" || status === "notStarted" ? null : timestamp,
    status,
  }
}

function draftResponse(
  status: "ready" | "applied" | "superseded" = "ready",
): Record<string, unknown> {
  return {
    appliedAt: status === "applied" ? timestamp : null,
    appliedProfileVersion: status === "applied" ? 2 : null,
    baseProfileId: null,
    baseProfileVersion: null,
    canApply: status === "ready",
    changeSummary: { changedItems: 0, missingItems: 0, newItems: 1 },
    createdAt: timestamp,
    draftVersion: 1,
    education: [],
    parsingResultVersion: 1,
    projectExperiences: [],
    protectedItems: [],
    resumeDocumentId: resumeId,
    skippedItems: [],
    skills: [{ id: skillId, name: "TypeScript" }],
    sourceRunId: runId,
    status,
    summary: "Resume summary",
    summaryAction: "set",
    unresolvedItems: [],
    updatedAt: timestamp,
    workExperiences: [],
  }
}

function applicationResponse(): Record<string, unknown> {
  return {
    draft: draftResponse("applied"),
    profile: {
      education: [],
      profileId,
      projectExperiences: [],
      skills: [],
      summary: "Resume summary",
      updatedAt: timestamp,
      version: 2,
      workExperiences: [],
    },
    profileChanged: true,
    profileCreated: true,
  }
}

describe("resume profile API service", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uploads pasted text as FormData without a multipart Content-Type", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(documentResponse()))

    await uploadResume({ text: "Resume text" })

    const request = fetchMock.mock.calls[0]?.[1]
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/profile/resumes")
    expect(request).toMatchObject({ credentials: "include", method: "POST" })
    expect(request?.body).toBeInstanceOf(FormData)
    const formData = request?.body
    if (!(formData instanceof FormData)) throw new TypeError("Expected FormData.")
    expect(formData.get("text")).toBe("Resume text")
    expect(formData.get("file")).toBeNull()
    expect(new Headers(request?.headers).get("Content-Type")).toBeNull()
  })

  it("uploads a file as FormData", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(documentResponse()))
    const file = new File(["Resume text"], "resume.pdf", { type: "application/pdf" })

    await uploadResume({ file })

    const body = fetchMock.mock.calls[0]?.[1]?.body
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get("file")).toBe(file)
    expect((body as FormData).get("text")).toBeNull()
  })

  it.each([{ file: new File(["resume"], "resume.pdf"), text: "Resume text" }, {}])(
    "rejects an upload without sending a request: %#",
    async (input) => {
      await expect(uploadResume(input)).rejects.toBeInstanceOf(TypeError)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    ["notStarted", "GET", undefined],
    ["queued", "POST", undefined],
    ["running", "GET", undefined],
    ["succeeded", "GET", undefined],
    ["failed", "POST", undefined],
  ] as const)("parses %s parsing responses", async (status, method, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(parsingResponse(status)))

    const result =
      method === "POST"
        ? status === "failed"
          ? await retryResumeParsing(resumeId)
          : await startResumeParsing(resumeId)
        : await getResumeParsingStatus(resumeId)

    expect(result.status).toBe(status)
    expect(fetchMock.mock.calls[0]?.[0]).toContain(`/api/profile/resumes/${resumeId}/parsing`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe(method === "GET" ? undefined : method)
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(body)
  })

  it("uses the retry endpoint without a JSON body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(parsingResponse("failed")))

    await retryResumeParsing(resumeId)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/profile/resumes/${resumeId}/parsing/retry`)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ body: undefined, method: "POST" })
  })

  it("gets an import draft and parses ready, applied, and superseded states", async () => {
    for (const status of ["ready", "applied", "superseded"] as const) {
      fetchMock.mockResolvedValueOnce(jsonResponse(draftResponse(status)))

      await expect(getResumeImportDraft(resumeId)).resolves.toMatchObject({ status })
    }

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/api/profile/resumes/${resumeId}/import-draft`,
      `/api/profile/resumes/${resumeId}/import-draft`,
      `/api/profile/resumes/${resumeId}/import-draft`,
    ])
  })

  it("applies a draft with only draftVersion in the JSON body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(applicationResponse()))

    await applyResumeImportDraft(resumeId, 1)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/profile/resumes/${resumeId}/import-draft/apply`)
    const request = fetchMock.mock.calls[0]?.[1]
    expect(request).toMatchObject({ credentials: "include", method: "POST" })
    expect(request?.body).toBe(JSON.stringify({ draftVersion: 1 }))
    expect(new Headers(request?.headers).get("Content-Type")).toBe("application/json")
  })

  it("rejects malformed API responses instead of casting them", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...documentResponse(), id: "not-a-uuid" }))

    await expect(uploadResume({ text: "Resume text" })).rejects.toBeInstanceOf(ZodError)
  })

  it("preserves every resume API error code on ApiError", async () => {
    const codes = [
      "resume_document_not_found",
      "resume_document_not_ready",
      "resume_document_text_missing",
      "resume_parsing_unavailable",
      "resume_parsing_retry_required",
      "resume_parsing_retry_not_allowed",
      "resume_import_draft_not_ready",
      "resume_import_draft_version_conflict",
      "resume_import_profile_version_conflict",
      "resume_import_apply_conflict",
      "resume_import_draft_invalid",
    ]

    for (const code of codes) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: code }, 409))

      const error = await getResumeImportDraft(resumeId).catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ body: { error: code }, code, status: 409 })
    }
  })
})
