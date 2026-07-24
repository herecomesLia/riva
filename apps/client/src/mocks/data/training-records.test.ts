import { describe, expect, it } from "vitest"

import {
  mockInterviewRecordDetailsMock,
  targetedPracticeRecordDetailsMock,
  trainingRecordDetailsMock,
} from "@/mocks/data/training-records"

describe("training record response fixtures", () => {
  it("keeps summary counts and detail snapshots internally consistent", () => {
    for (const record of trainingRecordDetailsMock) {
      expect(record.totalQuestionCount).toBe(record.questions.length)
      expect(record.answeredQuestionCount).toBe(
        record.questions.filter((question) => question.answer !== null).length,
      )
      expect(new Date(record.endedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(record.startedAt).getTime(),
      )
      expect(record.durationSeconds).toBeGreaterThanOrEqual(0)

      for (const question of record.questions) {
        expect(question.attemptNumber).toBeGreaterThanOrEqual(1)
        if (question.retryOfQuestionId) {
          expect(
            record.questions.some((candidate) => candidate.id === question.retryOfQuestionId),
          ).toBe(true)
        }
        expect(question.followUps.map((followUp) => followUp.order)).toEqual(
          question.followUps.map((_, index) => index + 1),
        )

        if (question.answer === null) {
          expect(question.evaluation).toBeNull()
          expect(question.review).toBeNull()
        }

        for (const followUp of question.followUps) {
          if (followUp.answer === null) {
            expect(followUp.evaluation).toBeNull()
            expect(followUp.review).toBeNull()
          }
        }
      }
    }
  })

  it("models completed, early-ended, and partially completed history", () => {
    expect(new Set(trainingRecordDetailsMock.map((record) => record.status))).toEqual(
      new Set(["completed", "endedEarly", "partiallyCompleted"]),
    )

    const partial = targetedPracticeRecordDetailsMock.find(
      (record) => record.status === "partiallyCompleted",
    )
    expect(partial?.questions[0]?.answer).not.toBeNull()
    expect(partial?.questions[0]?.followUps).toEqual([
      expect.objectContaining({ answer: null, evaluation: null, review: null }),
    ])

    const earlyInterview = mockInterviewRecordDetailsMock.find(
      (record) => record.status === "endedEarly",
    )
    expect(earlyInterview).toMatchObject({
      answeredQuestionCount: 1,
      totalQuestionCount: 2,
      overallScore: null,
      overallReview: {
        status: "partial",
        content: expect.objectContaining({
          summary: expect.stringContaining("提前结束"),
        }),
      },
    })
    expect(earlyInterview?.questions[0].followUps[0]).toMatchObject({
      answer: null,
      evaluation: null,
      review: null,
      referenceAnswer: { status: "notRequested", content: null },
    })

    const unavailable = mockInterviewRecordDetailsMock.find(
      (record) => record.overallReview.status === "unavailable",
    )
    expect(unavailable).toMatchObject({
      answeredQuestionCount: 0,
      overallReview: {
        status: "unavailable",
        content: null,
        reason: "insufficientAnswers",
      },
    })
  })

  it("preserves retry, flag, and reference-answer snapshots", () => {
    const complete = targetedPracticeRecordDetailsMock[0]
    expect(complete.questions).toEqual([
      expect.objectContaining({
        attemptNumber: 1,
        retryOfQuestionId: null,
        referenceAnswer: expect.objectContaining({ status: "unavailable" }),
      }),
      expect.objectContaining({
        attemptNumber: 2,
        retryOfQuestionId: complete.questions[0].id,
        isSaved: true,
        isMarkedWeak: false,
        referenceAnswer: expect.objectContaining({ status: "ready" }),
      }),
    ])
    expect(complete.questions[1].review?.reusableAnswerStructure).not.toHaveLength(0)
  })

  it("uses business content instead of translation keys", () => {
    const serialized = JSON.stringify(trainingRecordDetailsMock)
    expect(serialized).not.toMatch(/\b(?:common|dashboard|practice|interview|records)\.[\w.-]+/)
  })

  it("keeps the historical contract independent from runtime session identity", () => {
    const serialized = JSON.stringify(trainingRecordDetailsMock)
    expect(serialized).not.toContain('"sessionId"')
    expect(serialized).not.toContain('"version"')
    expect(serialized).not.toContain("mock-interview-session")
    expect(serialized).not.toContain("mock-practice-session")
  })
})
