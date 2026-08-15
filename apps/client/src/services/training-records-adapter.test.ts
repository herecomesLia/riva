import { describe, expect, it } from "vitest"

import { targetedPracticeTrainingRecordDetailResponseSchema } from "@/schemas/training-records"

import { adaptTargetedPracticeRecord } from "./training-records-adapter"

const roleId = "11111111-1111-4111-8111-111111111111"
const cardId = "22222222-2222-4222-8222-222222222222"
const firstAttemptId = "33333333-3333-4333-8333-333333333333"
const secondAttemptId = "44444444-4444-4444-8444-444444444444"
const followUpOneId = "55555555-5555-4555-8555-555555555555"
const followUpTwoId = "66666666-6666-4666-8666-666666666666"
const timestamp = "2026-08-15T08:00:00Z"

function mainReference() {
  return {
    status: "revealed" as const,
    viewedBeforeSubmission: false,
    content: {
      kind: "personalizedExample" as const,
      answer: "A reference answer.",
      keyPoints: ["Context", "Trade-off"],
      commonMistakes: ["Skipping evidence"],
      generatedAt: timestamp,
    },
  }
}

function followUpReference(addressedGap: string) {
  return {
    status: "revealed" as const,
    viewedBeforeSubmission: false,
    content: {
      kind: "personalizedSupplement" as const,
      addressedGap,
      answer: "A follow-up reference answer.",
      keyPoints: ["Evidence", "Impact"],
      commonMistakes: ["Vague ownership"],
      generatedAt: timestamp,
    },
  }
}

function evaluation(overallScore: number) {
  return {
    overallScore,
    dimensionScores: [
      { dimension: "relevance" as const, score: overallScore, explanation: "Relevant." },
      { dimension: "structure" as const, score: overallScore, explanation: "Structured." },
      { dimension: "specificity" as const, score: overallScore, explanation: "Specific." },
      {
        dimension: "personalContribution" as const,
        score: overallScore,
        explanation: "Owned.",
      },
    ],
    evaluatedAt: timestamp,
  }
}

function reviewedAttempt(
  attemptId: string,
  attemptNumber: number,
  retryOfAttemptId: string | null,
  score: number,
) {
  return {
    attemptId,
    attemptNumber,
    retryOfAttemptId,
    completedAt: timestamp,
    question: {
      questionCardId: cardId,
      prompt: "Describe a project you owned.",
      questionType: "projectDeepDive" as const,
      difficulty: "pressure" as const,
      assessedCapabilities: ["Ownership", "Trade-offs"],
      isSaved: true,
      isMarkedWeak: false,
      referenceAnswer: mainReference(),
    },
    mainAnswer: {
      id: `${attemptId.slice(0, 8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      content: `Answer ${attemptNumber}`,
      createdAt: timestamp,
      order: 1,
    },
    followUps: [
      {
        questionId: followUpOneId,
        prompt: "What trade-off did you make?",
        order: 1,
        askedAt: timestamp,
        answer: {
          id: "77777777-7777-4777-8777-777777777777",
          content: "I chose a simpler design.",
          createdAt: timestamp,
          order: 2,
        },
        referenceAnswer: followUpReference("Trade-off evidence"),
      },
      {
        questionId: followUpTwoId,
        prompt: "What was the result?",
        order: 2,
        askedAt: timestamp,
        answer: null,
        referenceAnswer: followUpReference("Outcome evidence"),
      },
    ],
    evaluation: evaluation(score),
    review: {
      overallPerformance: `Performance ${score}`,
      highlights: ["Clear ownership"],
      mainIssues: ["Add more metrics"],
      improvementSuggestions: ["Quantify the result"],
      reusableAnswerStructure: ["Context", "Action", "Result"],
      exposedWeaknesses: ["Metrics"],
    },
    recommendation: null,
  }
}

function recordWire() {
  return targetedPracticeTrainingRecordDetailResponseSchema.parse({
    recordId: "88888888-8888-4888-8888-888888888888",
    kind: "targetedPractice",
    status: "completed",
    language: "en",
    startedAt: timestamp,
    endedAt: timestamp,
    durationSeconds: 120,
    targetRole: { id: roleId, title: "Backend Engineer", company: "Riva" },
    setup: { source: "history", prioritizeWeaknesses: true },
    attempts: [
      reviewedAttempt(firstAttemptId, 1, null, 72),
      {
        ...reviewedAttempt(secondAttemptId, 2, firstAttemptId, 91),
        recommendation: {
          action: "retryCurrent" as const,
          reason: "Strengthen the same answer.",
        },
      },
    ],
    exposedWeaknesses: ["Metrics"],
    recommendation: {
      action: "retryCurrent" as const,
      reason: "Strengthen the same answer.",
    },
  })
}

describe("adaptTargetedPracticeRecord", () => {
  it("maps attempts, follow-ups, counts, final score, and retry identity", () => {
    const record = adaptTargetedPracticeRecord(recordWire())

    expect(record.setup).toEqual({
      questionType: "projectDeepDive",
      difficulty: "pressure",
      source: "history",
      prioritizedWeaknesses: true,
    })
    expect(record.answeredQuestionCount).toBe(2)
    expect(record.totalQuestionCount).toBe(2)
    expect(record.overallScore).toBe(91)
    expect(record.questions.map((question) => [question.id, question.retryOfQuestionId])).toEqual([
      [firstAttemptId, null],
      [secondAttemptId, firstAttemptId],
    ])
    expect(record.questions[1]?.followUps[1]).toMatchObject({
      id: followUpTwoId,
      answer: null,
      evaluation: null,
      review: null,
    })
    expect(record.questions[1]?.followUps[1]?.referenceAnswer).toMatchObject({
      status: "revealed",
      content: { addressedGap: "Outcome evidence" },
    })
    expect(record.recommendation).toEqual({
      action: "retryQuestion",
      reason: "Strengthen the same answer.",
      questionType: "projectDeepDive",
      difficulty: "pressure",
      focusAreas: [],
    })
  })

  it("keeps the last evaluated score when a later attempt is unfinished", () => {
    const wire = recordWire()
    wire.status = "partiallyCompleted"
    wire.attempts[1] = {
      ...wire.attempts[1]!,
      completedAt: null,
      mainAnswer: null,
      evaluation: null,
      review: null,
      recommendation: null,
    }

    const record = adaptTargetedPracticeRecord(wire)

    expect(record.answeredQuestionCount).toBe(1)
    expect(record.totalQuestionCount).toBe(2)
    expect(record.overallScore).toBe(72)
    expect(record.questions[1]?.answer).toBeNull()
  })

  it("returns no score for a single unfinished ended-early attempt", () => {
    const wire = recordWire()
    wire.status = "endedEarly"
    wire.attempts = [
      {
        ...wire.attempts[0]!,
        completedAt: null,
        mainAnswer: null,
        followUps: [],
        evaluation: null,
        review: null,
        recommendation: null,
      },
    ]
    wire.recommendation = null

    const record = adaptTargetedPracticeRecord(wire)

    expect(record.answeredQuestionCount).toBe(0)
    expect(record.totalQuestionCount).toBe(1)
    expect(record.overallScore).toBeNull()
  })

  it("preserves non-terminal reference states without translating them to ready", () => {
    const wire = recordWire()
    wire.attempts[0]!.question.referenceAnswer = {
      status: "generating",
      content: null,
      viewedBeforeSubmission: false,
    }

    const record = adaptTargetedPracticeRecord(wire)

    expect(record.questions[0]?.referenceAnswer).toEqual({
      status: "generating",
      content: null,
      viewedBeforeSubmission: false,
    })
  })
})
