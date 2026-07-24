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
      overallReview: expect.objectContaining({
        summary: expect.stringContaining("提前结束"),
      }),
    })
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
