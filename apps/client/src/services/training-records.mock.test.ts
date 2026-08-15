import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  mockInterviewRecordDetailsMock,
  targetedPracticeRecordDetailsMock,
  trainingRecordDetailsMock,
} from "@/mocks/data/training-records"
import { resetTrainingRecordsMockState } from "@/mocks/services/training-records"
import {
  TrainingRecordNotFoundError,
  type MockInterviewRecordDetailResponse,
  type TargetedPracticeRecordDetailResponse,
  type TrainingRecordReferenceAnswerTarget,
} from "@/models/training-records"
import {
  getTrainingRecordReferenceAnswerGenerationStatus,
  getMockInterviewRecord,
  getTargetedPracticeRecord,
  getTrainingRecordsOverview,
  listTrainingRecords,
  requestTrainingRecordReferenceAnswer,
} from "@/services/training-records"

beforeEach(() => {
  vi.useFakeTimers()
  resetTrainingRecordsMockState()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return promise
}

describe("training records mock service", () => {
  it("returns overview statistics calculated from all historical records", async () => {
    const responsePromise = getTrainingRecordsOverview()
    await vi.advanceTimersByTimeAsync(999)
    const pendingCheck = await Promise.race([
      responsePromise.then(() => "resolved"),
      Promise.resolve("pending"),
    ])
    expect(pendingCheck).toBe("pending")
    await vi.advanceTimersByTimeAsync(1)

    await expect(responsePromise).resolves.toEqual({
      totalRecordCount: 6,
      completedRecordCount: 2,
      totalDurationSeconds: 4110,
      answeredQuestionCount: 6,
      averageScore: 78,
      targetRoles: [
        {
          id: "role_frontend_bytedance",
          title: "Senior Frontend Engineer",
          company: "ByteDance",
        },
        {
          id: "role_product_manager_meituan",
          title: "Product Manager",
          company: "Meituan",
        },
      ],
      byKind: {
        targetedPractice: {
          recordCount: 3,
          completedRecordCount: 1,
          averageScore: 77,
        },
        mockInterview: {
          recordCount: 3,
          completedRecordCount: 1,
          averageScore: 80,
        },
      },
    })
  })

  it("applies kind, status, role, and date filters on the service side", async () => {
    const page = await settle(
      listTrainingRecords({
        kinds: ["targetedPractice"],
        statuses: ["partiallyCompleted"],
        targetRoleId: "role_frontend_bytedance",
        startedAtFrom: "2026-07-18T00:00:00.000Z",
        startedAtTo: "2026-07-19T00:00:00.000Z",
        page: 1,
        pageSize: 20,
      }),
    )

    expect(page.items).toEqual([
      expect.objectContaining({
        id: "targeted-practice-record-002",
        kind: "targetedPractice",
        status: "partiallyCompleted",
      }),
    ])
    expect(page.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    })
  })

  it("sorts records newest first and returns stable server pagination metadata", async () => {
    const firstPage = await settle(listTrainingRecords({ page: 1, pageSize: 2 }))
    const secondPage = await settle(listTrainingRecords({ page: 2, pageSize: 2 }))
    const finalPage = await settle(listTrainingRecords({ page: 3, pageSize: 2 }))

    expect(firstPage.items.map((record) => record.id)).toEqual([
      "targeted-practice-record-001",
      "targeted-practice-record-002",
    ])
    expect(secondPage.items.map((record) => record.id)).toEqual([
      "mock-interview-record-001",
      "targeted-practice-record-003",
    ])
    expect(finalPage.items.map((record) => record.id)).toEqual([
      "mock-interview-record-002",
      "mock-interview-record-003",
    ])
    expect(finalPage.pagination).toEqual({
      page: 3,
      pageSize: 2,
      totalItems: 6,
      totalPages: 3,
    })
  })

  it("returns empty list pages and an empty overview without inventing values", async () => {
    const noMatch = await settle(
      listTrainingRecords({
        targetRoleId: "unknown-role",
        page: 1,
        pageSize: 10,
      }),
    )
    expect(noMatch).toEqual({
      items: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    })

    resetTrainingRecordsMockState("empty")
    await expect(settle(getTrainingRecordsOverview())).resolves.toEqual({
      totalRecordCount: 0,
      completedRecordCount: 0,
      totalDurationSeconds: 0,
      answeredQuestionCount: 0,
      averageScore: null,
      targetRoles: [],
      byKind: {
        targetedPractice: {
          recordCount: 0,
          completedRecordCount: 0,
          averageScore: null,
        },
        mockInterview: {
          recordCount: 0,
          completedRecordCount: 0,
          averageScore: null,
        },
      },
    })
  })

  it("returns each record kind through its own detail query", async () => {
    const practice = await settle(
      getTargetedPracticeRecord(targetedPracticeRecordDetailsMock[0].id),
    )
    const interview = await settle(getMockInterviewRecord(mockInterviewRecordDetailsMock[0].id))

    expect(practice).toEqual(targetedPracticeRecordDetailsMock[0])
    expect(practice.questions[1]).toMatchObject({
      answer: expect.objectContaining({ content: expect.any(String) }),
      evaluation: expect.objectContaining({ overallScore: 86 }),
      review: expect.objectContaining({ summary: expect.any(String) }),
      referenceAnswer: expect.objectContaining({ status: "revealed" }),
      followUps: [
        expect.objectContaining({
          answer: expect.objectContaining({ content: expect.any(String) }),
          evaluation: expect.objectContaining({ overallScore: 82 }),
          review: expect.objectContaining({ summary: expect.any(String) }),
          referenceAnswer: expect.objectContaining({ status: "revealed" }),
        }),
      ],
    })
    expect(interview).toEqual(mockInterviewRecordDetailsMock[0])
    expect(interview.overallReview).toMatchObject({
      status: "complete",
      content: expect.objectContaining({ summary: expect.any(String) }),
    })
  })

  it("preserves unanswered follow-ups in partially completed detail", async () => {
    const partialFixture = targetedPracticeRecordDetailsMock.find(
      (record) => record.status === "partiallyCompleted",
    )
    if (!partialFixture) throw new Error("The partial practice record fixture is missing.")

    const detail = await settle(getTargetedPracticeRecord(partialFixture.id))

    expect(detail).toMatchObject({
      status: "partiallyCompleted",
      answeredQuestionCount: 1,
      questions: [
        {
          answer: expect.objectContaining({ content: expect.any(String) }),
          followUps: [
            {
              answer: null,
              evaluation: null,
              review: null,
              referenceAnswer: {
                status: "notRequested",
                content: null,
              },
            },
          ],
        },
      ],
    })
  })

  it("rejects unknown and wrong-kind record IDs with a structured error", async () => {
    const unknownPromise = getTargetedPracticeRecord("unknown-record")
    const unknownExpectation = expect(unknownPromise).rejects.toEqual(
      expect.objectContaining({
        name: "TrainingRecordNotFoundError",
        code: "trainingRecordNotFound",
        recordKind: "targetedPractice",
        recordId: "unknown-record",
      }),
    )
    await vi.runAllTimersAsync()
    await unknownExpectation

    const wrongKindPromise = getMockInterviewRecord(targetedPracticeRecordDetailsMock[0].id)
    const wrongKindExpectation = expect(wrongKindPromise).rejects.toBeInstanceOf(
      TrainingRecordNotFoundError,
    )
    await vi.runAllTimersAsync()
    await wrongKindExpectation
  })

  it("returns independent structured clones from list, overview, and detail queries", async () => {
    const firstList = await settle(listTrainingRecords({ page: 1, pageSize: 10 }))
    firstList.items[0].targetRole.title = "被修改的岗位"
    const secondList = await settle(listTrainingRecords({ page: 1, pageSize: 10 }))
    expect(secondList.items[0].targetRole.title).not.toBe("被修改的岗位")

    const firstDetail = await settle(getTargetedPracticeRecord("targeted-practice-record-001"))
    firstDetail.questions[0].prompt = "被修改的问题"
    const secondDetail = await settle(getTargetedPracticeRecord("targeted-practice-record-001"))
    expect(secondDetail.questions[0].prompt).not.toBe("被修改的问题")

    const firstOverview = await settle(getTrainingRecordsOverview())
    firstOverview.byKind.targetedPractice.recordCount = 999
    const secondOverview = await settle(getTrainingRecordsOverview())
    expect(secondOverview.byKind.targetedPractice.recordCount).toBe(3)
    expect(trainingRecordDetailsMock).toHaveLength(
      targetedPracticeRecordDetailsMock.length + mockInterviewRecordDetailsMock.length,
    )
  })

  it.each<{
    label: string
    target: TrainingRecordReferenceAnswerTarget
  }>([
    {
      label: "targeted-practice main question",
      target: {
        kind: "targetedPractice",
        subject: "mainQuestion",
        recordId: "targeted-practice-record-003",
        questionId: "history-practice-question-003",
      },
    },
    {
      label: "targeted-practice follow-up",
      target: {
        kind: "targetedPractice",
        subject: "followUp",
        recordId: "targeted-practice-record-002",
        questionId: "history-practice-question-002",
        followUpId: "history-practice-follow-up-002",
      },
    },
    {
      label: "mock-interview main question",
      target: {
        kind: "mockInterview",
        subject: "mainQuestion",
        recordId: "mock-interview-record-001",
        questionId: "history-interview-question-002",
      },
    },
    {
      label: "mock-interview follow-up",
      target: {
        kind: "mockInterview",
        subject: "followUp",
        recordId: "mock-interview-record-002",
        questionId: "history-interview-question-004",
        followUpId: "history-interview-follow-up-002",
      },
    },
  ])("generates and persists a reference for $label", async ({ target }) => {
    resetTrainingRecordsMockState("default", {
      referenceAnswerOutcome: "ready",
      referenceAnswerPollsBeforeCompletion: 1,
    })
    const before =
      target.kind === "targetedPractice"
        ? await settle(getTargetedPracticeRecord(target.recordId))
        : await settle(getMockInterviewRecord(target.recordId))

    await expect(settle(requestTrainingRecordReferenceAnswer(target))).resolves.toMatchObject({
      target,
      referenceAnswer: { status: "generating" },
    })
    await expect(
      settle(getTrainingRecordReferenceAnswerGenerationStatus(target)),
    ).resolves.toMatchObject({ referenceAnswer: { status: "generating" } })
    await expect(
      settle(getTrainingRecordReferenceAnswerGenerationStatus(target)),
    ).resolves.toMatchObject({
      referenceAnswer: { status: target.kind === "targetedPractice" ? "revealed" : "ready" },
    })

    const after =
      target.kind === "targetedPractice"
        ? await settle(getTargetedPracticeRecord(target.recordId))
        : await settle(getMockInterviewRecord(target.recordId))
    const expected = structuredClone(before)
    replaceExpectedReferenceAnswer(expected, after, target)
    expect(after).toEqual(expected)
  })

  it("protects a generating target from duplicate concurrent requests", async () => {
    const target = {
      kind: "targetedPractice",
      subject: "mainQuestion",
      recordId: "targeted-practice-record-003",
      questionId: "history-practice-question-003",
    } as const
    const first = requestTrainingRecordReferenceAnswer(target)
    const duplicate = requestTrainingRecordReferenceAnswer(target)
    const duplicateAssertion = expect(duplicate).rejects.toMatchObject({
      code: "alreadyGenerating",
    })
    await vi.runAllTimersAsync()

    await expect(first).resolves.toMatchObject({ referenceAnswer: { status: "generating" } })
    await duplicateAssertion
  })

  it("allows generationFailed retries but rejects insufficientContext retries", async () => {
    resetTrainingRecordsMockState("default", {
      referenceAnswerOutcome: "generationFailed",
      referenceAnswerPollsBeforeCompletion: 0,
    })
    const retryable = {
      kind: "mockInterview",
      subject: "mainQuestion",
      recordId: "mock-interview-record-001",
      questionId: "history-interview-question-002",
    } as const
    await settle(requestTrainingRecordReferenceAnswer(retryable))
    await expect(
      settle(getTrainingRecordReferenceAnswerGenerationStatus(retryable)),
    ).resolves.toMatchObject({
      referenceAnswer: { status: "unavailable", reason: "generationFailed" },
    })
    await expect(settle(requestTrainingRecordReferenceAnswer(retryable))).resolves.toMatchObject({
      referenceAnswer: { status: "generating" },
    })

    const insufficient = {
      kind: "mockInterview",
      subject: "mainQuestion",
      recordId: "mock-interview-record-002",
      questionId: "history-interview-question-003",
    } as const
    const request = requestTrainingRecordReferenceAnswer(insufficient)
    const assertion = expect(request).rejects.toMatchObject({ code: "insufficientContext" })
    await vi.runAllTimersAsync()
    await assertion
  })
})

function replaceExpectedReferenceAnswer(
  expected: TargetedPracticeRecordDetailResponse | MockInterviewRecordDetailResponse,
  actual: TargetedPracticeRecordDetailResponse | MockInterviewRecordDetailResponse,
  target: TrainingRecordReferenceAnswerTarget,
) {
  const expectedQuestion = expected.questions.find(({ id }) => id === target.questionId)!
  const actualQuestion = actual.questions.find(({ id }) => id === target.questionId)!
  if (target.subject === "mainQuestion") {
    expectedQuestion.referenceAnswer = actualQuestion.referenceAnswer
    return
  }
  const expectedFollowUp = expectedQuestion.followUps.find(({ id }) => id === target.followUpId)!
  const actualFollowUp = actualQuestion.followUps.find(({ id }) => id === target.followUpId)!
  expectedFollowUp.referenceAnswer = actualFollowUp.referenceAnswer
}
