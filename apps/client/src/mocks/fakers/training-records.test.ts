import { describe, expect, it } from "vitest"

import { trainingRecordsFixture } from "@/mocks/fixtures/training-records"
import { createTrainingRecordsFaker } from "./training-records"

describe("trainingRecordsFaker", () => {
  it("supports filters and pagination", () => {
    const faker = createTrainingRecordsFaker()
    const { practice, interview } = trainingRecordsFixture
    const input = { page: 1, pageSize: 1 }
    const first = faker.list(input)
    expect(first.pagination).toEqual({ ...input, totalItems: 2, totalPages: 2 })
    expect(first.items).toMatchObject([
      {
        id: practice.id,
        kind: practice.kind,
        questionType: practice.setup.questionType,
        difficulty: practice.setup.difficulty,
        reviewSummary: practice.questions[0].review.summary,
      },
    ])
    expect(faker.list({ ...input, page: 2 }).items).toMatchObject([
      {
        id: interview.id,
        round: interview.setup.round,
        reviewSummary: interview.overallReview.content.summary,
      },
    ])
    expect(faker.list({ ...input, kinds: ["mockInterview"] }).items[0]?.id).toBe(interview.id)
    expect(faker.list({ ...input, targetRoleId: practice.targetRole.id }).items[0]?.id).toBe(
      practice.id,
    )
    expect(faker.list({ ...input, startedAtFrom: practice.startedAt }).items[0]?.id).toBe(
      practice.id,
    )
    expect(faker.list({ ...input, startedAtTo: interview.startedAt }).items[0]?.id).toBe(
      interview.id,
    )
    expect(faker.list({ ...input, statuses: ["endedEarly"] }).items).toEqual([])
  })

  it("returns independent details and null for missing records or the wrong kind", () => {
    const faker = createTrainingRecordsFaker()
    const { practice, interview } = trainingRecordsFixture
    const detail = faker.practice(practice.id)
    expect(detail).toEqual(practice)
    expect(faker.interview(interview.id)).toEqual(interview)
    expect(faker.practice(interview.id)).toBeNull()
    expect(faker.interview(practice.id)).toBeNull()
    expect(faker.practice("unknown")).toBeNull()
    expect(faker.interview("unknown")).toBeNull()
    detail!.questions[0]!.answer!.content = "外部修改"
    expect(faker.practice(practice.id)).toEqual(practice)
  })

  it("stores the fixed reference without changing other detail data", () => {
    const faker = createTrainingRecordsFaker()
    const before = faker.practice(trainingRecordsFixture.practice.id)!
    expect(before.questions[0]!.referenceAnswer.status).toBe("notRequested")
    const result = faker.reference({
      kind: "targetedPractice",
      recordId: before.id,
      questionId: before.questions[0]!.id,
      subject: "mainQuestion",
    })
    expect(result).toEqual(trainingRecordsFixture.reference)
    const expected = structuredClone(before)
    expected.questions[0]!.referenceAnswer = structuredClone(trainingRecordsFixture.reference)
    expect(faker.practice(before.id)).toEqual(expected)
    expect(faker.interview(trainingRecordsFixture.interview.id)).toEqual(
      trainingRecordsFixture.interview,
    )
  })
})
