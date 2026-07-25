import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  mockInterviewRecordDetailsMock,
  targetedPracticeRecordDetailsMock,
  trainingRecordDetailsMock,
} from "@/mocks/data/training-records"
import { resetTrainingRecordsMockState } from "@/mocks/services/training-records"
import { TrainingRecordNotFoundError } from "@/models/training-records"
import {
  getMockInterviewRecord,
  getTargetedPracticeRecord,
  getTrainingRecordsOverview,
  listTrainingRecords,
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
      referenceAnswer: expect.objectContaining({ status: "ready" }),
      followUps: [
        expect.objectContaining({
          answer: expect.objectContaining({ content: expect.any(String) }),
          evaluation: expect.objectContaining({ overallScore: 82 }),
          review: expect.objectContaining({ summary: expect.any(String) }),
          referenceAnswer: expect.objectContaining({ status: "ready" }),
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
                status: "unavailable",
                content: null,
                reason: "insufficientContext",
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
})
