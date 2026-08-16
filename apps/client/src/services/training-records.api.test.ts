import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

import { TrainingRecordNotFoundError } from "@/models/training-records"

import {
  getTargetedPracticeRecord,
  getTrainingRecordsOverview,
  listTrainingRecords,
} from "./training-records"

const recordId = "11111111-1111-4111-8111-111111111111"
const timestamp = "2026-08-15T08:00:00Z"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

function recordResponse(): Record<string, unknown> {
  return {
    recordId,
    kind: "targetedPractice",
    status: "completed",
    language: "zh-CN",
    startedAt: timestamp,
    endedAt: timestamp,
    durationSeconds: 0,
    targetRole: {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Backend Engineer",
      company: null,
    },
    setup: { source: "personalized", prioritizeWeaknesses: false },
    attempts: [
      {
        attemptId: "33333333-3333-4333-8333-333333333333",
        attemptNumber: 1,
        retryOfAttemptId: null,
        completedAt: timestamp,
        question: {
          questionCardId: "44444444-4444-4444-8444-444444444444",
          prompt: "Describe a project you owned.",
          questionType: "projectDeepDive",
          difficulty: "basic",
          assessedCapabilities: ["Ownership"],
          isSaved: false,
          isMarkedWeak: false,
          referenceAnswer: {
            status: "revealed",
            viewedBeforeSubmission: false,
            content: {
              kind: "technicalReference",
              answer: "A reference answer.",
              keyPoints: ["Context", "Trade-off"],
              commonMistakes: ["No evidence"],
              generatedAt: timestamp,
            },
          },
        },
        mainAnswer: null,
        followUps: [],
        evaluation: null,
        review: null,
        recommendation: null,
      },
    ],
    exposedWeaknesses: [],
    recommendation: null,
  }
}

function summaryResponse() {
  return {
    recordId,
    kind: "targetedPractice",
    language: "en",
    status: "completed",
    startedAt: timestamp,
    endedAt: timestamp,
    durationSeconds: 600,
    targetRole: {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Backend Engineer",
      company: "Riva",
    },
    answeredQuestionCount: 1,
    totalQuestionCount: 1,
    overallScore: 86,
    reviewSummary: "Strong ownership evidence.",
    questionType: "behavioral",
    difficulty: "basic",
  }
}

function overviewResponse() {
  return {
    totalRecordCount: 1,
    completedRecordCount: 1,
    totalDurationSeconds: 600,
    answeredQuestionCount: 1,
    averageScore: 86,
    targetRoles: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "Backend Engineer",
        company: "Riva",
      },
    ],
    byKind: {
      targetedPractice: { recordCount: 1, completedRecordCount: 1, averageScore: 86 },
      mockInterview: { recordCount: 0, completedRecordCount: 0, averageScore: null },
    },
  }
}

function pageResponse(items = [summaryResponse()]) {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: items.length,
      totalPages: items.length ? 1 : 0,
    },
  }
}

describe("targeted practice training record API service", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("requests the record endpoint and adapts the strict wire response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(recordResponse()))

    const record = await getTargetedPracticeRecord(recordId)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/training-records/practice/${recordId}`)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" })
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined()
    expect(record).toMatchObject({
      id: recordId,
      kind: "targetedPractice",
      answeredQuestionCount: 0,
      totalQuestionCount: 1,
      overallScore: null,
    })
    expect(record.questions[0]?.referenceAnswer.status).toBe("revealed")
  })

  it("maps API 404 to the training-record not-found error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "training_record_not_found" }, 404))

    const request = getTargetedPracticeRecord(recordId)
    await expect(request).rejects.toEqual(
      expect.objectContaining({
        recordId,
        recordKind: "targetedPractice",
      }),
    )
    await expect(request).rejects.toBeInstanceOf(TrainingRecordNotFoundError)
  })

  it("preserves non-404 API errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "training_record_state_conflict" }, 409))

    await expect(getTargetedPracticeRecord(recordId)).rejects.toMatchObject({
      status: 409,
      code: "training_record_state_conflict",
    })
  })

  it("rejects a response outside the wire schema", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ recordId }))

    await expect(getTargetedPracticeRecord(recordId)).rejects.toBeInstanceOf(ZodError)
  })

  it("gets and adapts the overview through the real API", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(overviewResponse()))

    await expect(getTrainingRecordsOverview()).resolves.toMatchObject({
      totalRecordCount: 1,
      averageScore: 86,
      byKind: {
        targetedPractice: { recordCount: 1 },
        mockInterview: { recordCount: 0, averageScore: null },
      },
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/training-records/overview")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "GET",
    })
  })

  it("rejects a malformed overview response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ totalRecordCount: 1 }))

    await expect(getTrainingRecordsOverview()).rejects.toBeInstanceOf(ZodError)
  })

  it("serializes repeated filters and omits undefined filters for the real list API", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(pageResponse()))

    const result = await listTrainingRecords({
      kinds: ["targetedPractice", "mockInterview"],
      statuses: ["completed", "partiallyCompleted"],
      targetRoleId: "22222222-2222-4222-8222-222222222222",
      startedAtFrom: "2026-08-01T00:00:00+08:00",
      startedAtTo: "2026-08-15T23:59:59+08:00",
      page: 2,
      pageSize: 20,
    })

    const request = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://localhost")
    expect(request.pathname).toBe("/api/training-records")
    expect(request.searchParams.getAll("kinds")).toEqual(["targetedPractice", "mockInterview"])
    expect(request.searchParams.getAll("statuses")).toEqual(["completed", "partiallyCompleted"])
    expect(request.searchParams.get("targetRoleId")).toBe("22222222-2222-4222-8222-222222222222")
    expect(request.searchParams.get("startedAtFrom")).toBe("2026-08-01T00:00:00+08:00")
    expect(request.searchParams.get("startedAtTo")).toBe("2026-08-15T23:59:59+08:00")
    expect(request.searchParams.get("page")).toBe("2")
    expect(request.searchParams.get("pageSize")).toBe("20")
    expect(request.searchParams.has("unusedFilter")).toBe(false)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "GET",
    })
    expect(result.items[0]).toMatchObject({ id: recordId, kind: "targetedPractice" })
  })

  it("supports an empty mock-interview-only page", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(pageResponse([])))

    await expect(
      listTrainingRecords({ kinds: ["mockInterview"], page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    })
    const request = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://localhost")
    expect(request.searchParams.getAll("kinds")).toEqual(["mockInterview"])
    expect(request.searchParams.has("statuses")).toBe(false)
  })

  it("rejects a malformed list response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], pagination: { page: 0 } }))

    await expect(listTrainingRecords({ page: 1, pageSize: 20 })).rejects.toBeInstanceOf(ZodError)
  })
})
