import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

import { TrainingRecordNotFoundError } from "@/models/training-records"

import { getTargetedPracticeRecord } from "./training-records"

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
})
