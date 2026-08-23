import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

import {
  TrainingRecordNotFoundError,
  type TrainingRecordReferenceAnswerTarget,
} from "@/models/training-records"

import {
  getTargetedPracticeRecord,
  getMockInterviewRecord,
  getTrainingRecordsOverview,
  listTrainingRecords,
  requestTrainingRecordReferenceAnswer,
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

function mockInterviewRecordResponse(): Record<string, unknown> {
  const questionId = "33333333-3333-4333-8333-333333333333"
  const answerId = "44444444-4444-4444-8444-444444444444"
  const referenceAnswer = {
    status: "ready",
    content: {
      recommendedStructure: ["Context", "Action", "Result"],
      keyPoints: ["Name the measurable result."],
      exampleAnswer: "I describe the context, my contribution, and the result.",
      usageGuidance: "Adapt this structure to your own evidence.",
      generatedAt: timestamp,
    },
    reason: null,
  }
  return {
    recordId,
    kind: "mockInterview",
    status: "completed",
    language: "en",
    startedAt: timestamp,
    endedAt: timestamp,
    durationSeconds: 0,
    targetRole: {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Backend Engineer",
      company: "Riva",
    },
    completionReason: "formalQuestionsCompleted",
    setup: { round: "technical", difficulty: "pressure", plannedDurationMinutes: 30 },
    questionDetails: [
      {
        record: {
          status: "answered",
          question: {
            id: questionId,
            prompt: "Describe a project you owned.",
            type: "projectDeepDive",
            assessedCapabilities: ["Ownership"],
            order: 1,
          },
          answer: {
            id: answerId,
            content: "I owned the delivery and measured the outcome.",
            submittedAt: timestamp,
          },
          followUps: [],
        },
        performance: {
          questionId,
          score: 84,
          summary: "The answer was relevant.",
          strengths: ["Clear ownership"],
          issues: ["Add one more metric."],
        },
        referenceAnswer,
        followUps: [],
      },
    ],
    review: {
      status: "complete",
      review: {
        overallPerformance: "The answer was structured and relevant.",
        questionReviews: [
          {
            questionId,
            score: 84,
            summary: "The answer was relevant.",
            strengths: ["Clear ownership"],
            issues: ["Add one more metric."],
          },
        ],
        mainStrengths: ["Clear ownership"],
        frequentIssues: ["Quantify outcomes."],
        exposedWeaknesses: ["Metrics"],
        riskPoints: ["Probe scale."],
        communicationSuggestions: ["Lead with the result."],
        preparationSuggestions: ["Prepare two quantified examples."],
        generatedAt: timestamp,
        overallScore: 84,
        dimensionScores: [
          "relevance",
          "structure",
          "specificity",
          "personalContribution",
          "resultsAndEvidence",
          "roleAlignment",
          "communication",
          "riskControl",
        ].map((dimension) => ({
          dimension,
          score: 84,
          explanation: "The evidence supports this score.",
        })),
        nextTraining: {
          action: "targetedPractice",
          reason: "Strengthen quantified outcomes.",
          focusAreas: ["Results"],
          questionType: "projectDeepDive",
          difficulty: "pressure",
        },
      },
    },
    candidateQuestionExchanges: [
      {
        question: {
          id: "55555555-5555-4555-8555-555555555555",
          content: "How does the team define success?",
          submittedAt: timestamp,
        },
        interviewerAnswer: "The team uses role-relevant delivery and quality signals.",
        feedback: {
          summary: "Specific and role-relevant.",
          strengths: ["Specific"],
          improvementSuggestions: [],
          suggestedAlternatives: [],
        },
      },
    ],
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

function mainReferenceAnswerResponse(): Record<string, unknown> {
  return {
    target: {
      kind: "targetedPractice",
      recordId,
      questionId: "33333333-3333-4333-8333-333333333333",
      subject: "mainQuestion",
    },
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
  }
}

function followUpReferenceAnswerResponse(): Record<string, unknown> {
  return {
    target: {
      kind: "targetedPractice",
      recordId,
      questionId: "33333333-3333-4333-8333-333333333333",
      subject: "followUp",
      followUpId: "55555555-5555-4555-8555-555555555555",
    },
    referenceAnswer: {
      status: "revealed",
      viewedBeforeSubmission: false,
      content: {
        kind: "technicalReference",
        addressedGap: "Add concrete evidence.",
        answer: "A follow-up reference answer.",
        keyPoints: ["Context", "Trade-off"],
        commonMistakes: ["No evidence"],
        generatedAt: timestamp,
      },
    },
  }
}

function pageResponse(items: Array<Record<string, unknown>> = [summaryResponse()]) {
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

  it("requests and adapts a real Mock Interview training record", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockInterviewRecordResponse()))

    const record = await getMockInterviewRecord(recordId)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/training-records/interview/${recordId}`)
    expect(record).toMatchObject({
      id: recordId,
      kind: "mockInterview",
      overallScore: 84,
      overallReview: {
        status: "complete",
        content: { summary: "The answer was structured and relevant." },
      },
      candidateQuestionExchanges: [{ question: "How does the team define success?" }],
    })
    expect(record.questions[0]).toMatchObject({
      answer: { content: "I owned the delivery and measured the outcome." },
      referenceAnswer: { status: "ready" },
      evaluation: { overallScore: 84 },
    })
    expect(record.questions[0]?.referenceAnswer).not.toHaveProperty("reason")
  })

  it("maps a Mock Interview detail 404 to the structured not-found error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "training_record_not_found" }, 404))

    await expect(getMockInterviewRecord(recordId)).rejects.toEqual(
      expect.objectContaining({
        recordId,
        recordKind: "mockInterview",
      }),
    )
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

  it("adapts mixed targeted-practice and Mock Interview summaries", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        pageResponse([
          summaryResponse(),
          {
            recordId: "99999999-9999-4999-8999-999999999999",
            kind: "mockInterview",
            language: "en",
            status: "partiallyCompleted",
            startedAt: timestamp,
            endedAt: timestamp,
            durationSeconds: 300,
            targetRole: {
              id: "22222222-2222-4222-8222-222222222222",
              title: "Backend Engineer",
              company: "Riva",
            },
            answeredQuestionCount: 1,
            totalQuestionCount: 2,
            overallScore: null,
            reviewSummary: "Useful evidence was captured.",
            round: "technical",
            difficulty: "pressure",
          },
        ]),
      ),
    )

    const result = await listTrainingRecords({ page: 1, pageSize: 20 })

    expect(result.items.map((item) => item.kind)).toEqual(["targetedPractice", "mockInterview"])
    expect(result.items[1]).toMatchObject({
      id: "99999999-9999-4999-8999-999999999999",
      round: "technical",
      difficulty: "pressure",
    })
  })

  it("rejects a malformed list response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], pagination: { page: 0 } }))

    await expect(listTrainingRecords({ page: 1, pageSize: 20 })).rejects.toBeInstanceOf(ZodError)
  })

  it("requests a main-question reference answer with the targeted practice body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mainReferenceAnswerResponse()))
    const target: Extract<
      TrainingRecordReferenceAnswerTarget,
      { kind: "targetedPractice"; subject: "mainQuestion" }
    > = {
      kind: "targetedPractice",
      recordId,
      questionId: "33333333-3333-4333-8333-333333333333",
      subject: "mainQuestion",
    }

    await expect(requestTrainingRecordReferenceAnswer(target)).resolves.toMatchObject({
      target,
      referenceAnswer: { status: "revealed" },
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/training-records/practice/${recordId}/reference-answer`,
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "POST",
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      subject: "mainQuestion",
      questionId: target.questionId,
    })
  })

  it("requests a follow-up reference answer with followUpId", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(followUpReferenceAnswerResponse()))
    const target: Extract<
      TrainingRecordReferenceAnswerTarget,
      { kind: "targetedPractice"; subject: "followUp" }
    > = {
      kind: "targetedPractice",
      recordId,
      questionId: "33333333-3333-4333-8333-333333333333",
      subject: "followUp",
      followUpId: "55555555-5555-4555-8555-555555555555",
    }

    await expect(requestTrainingRecordReferenceAnswer(target)).resolves.toMatchObject({
      target,
      referenceAnswer: { status: "revealed" },
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      subject: "followUp",
      questionId: target.questionId,
      followUpId: target.followUpId,
    })
  })

  it("rejects malformed reference-answer responses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ target: { kind: "targetedPractice" } }))
    const target = {
      kind: "targetedPractice" as const,
      recordId,
      questionId: "33333333-3333-4333-8333-333333333333",
      subject: "mainQuestion" as const,
    }

    await expect(requestTrainingRecordReferenceAnswer(target)).rejects.toBeInstanceOf(ZodError)
  })

  it("keeps real mock-interview reference answers unavailable without a request", async () => {
    const target: Extract<TrainingRecordReferenceAnswerTarget, { kind: "mockInterview" }> = {
      kind: "mockInterview",
      recordId,
      questionId: "33333333-3333-4333-8333-333333333333",
      subject: "mainQuestion",
    }

    await expect(requestTrainingRecordReferenceAnswer(target)).rejects.toThrow(
      "Reference answers are not available for mock interviews.",
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
