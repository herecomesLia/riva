import { describe, expect, it } from "vitest"

import {
  practiceAnswerSchema,
  practiceAnsweredFollowUpExchangeSchema,
  practiceAwaitingFollowUpExchangeSchema,
  currentPracticeSessionResponseSchema,
  practiceCompletedFollowUpCompletionSchema,
  practiceEvaluationSchema,
  practiceActiveSessionResponseSchema,
  practiceFollowUpQuestionSchema,
  practiceQuestionSchema,
  practiceRecommendationSchema,
  practiceReviewSchema,
  practiceSessionSelectionSchema,
} from "./practice"

const roleId = "11111111-1111-4111-8111-111111111111"
const sessionId = "22222222-2222-4222-8222-222222222222"
const attemptId = "33333333-3333-4333-8333-333333333333"
const questionId = "44444444-4444-4444-8444-444444444444"
const materialId = "55555555-5555-4555-8555-555555555555"
const followUpQuestionId = "77777777-7777-4777-8777-777777777777"
const answerId = "88888888-8888-4888-8888-888888888888"
const templateId = "projectDeepDive.performanceOptimization.followUp.1"

const selection = {
  difficulty: "basic" as const,
  prioritizeWeaknesses: false,
  questionType: "projectDeepDive" as const,
  source: "personalized" as const,
  targetRoleId: roleId,
}

const question = {
  answerFramework: { content: null, status: "notRequested" as const },
  answerHints: { content: null, status: "notRequested" as const },
  assessedCapabilities: ["问题分析"],
  difficulty: "basic" as const,
  id: questionId,
  isMarkedWeak: false,
  isSaved: false,
  prompt: "请介绍一次你主导的复杂项目。",
  questionType: "projectDeepDive" as const,
  recommendedMaterials: [
    {
      id: materialId,
      label: "结算页性能优化项目",
      reason: "补充项目结果证据。",
      type: "projectExperience" as const,
    },
  ],
  referenceAnswer: {
    content: null,
    status: "notRequested" as const,
    viewedBeforeSubmission: false,
  },
}

const mainAnswer = {
  content: "主回答内容",
  createdAt: "2026-08-11T08:01:00.000Z",
  id: answerId,
  order: 1,
}

const followUpQuestion = {
  answerFramework: { content: null, status: "notRequested" as const },
  answerHints: { content: null, status: "notRequested" as const },
  createdAt: "2026-08-11T08:01:00.000Z",
  id: followUpQuestionId,
  order: 1,
  prompt: "请补充关键证据。",
  referenceAnswer: {
    content: null,
    status: "notRequested" as const,
    viewedBeforeSubmission: false,
  },
}

const answeredExchange = {
  answer: { ...mainAnswer, content: "追问回答内容", order: 2 },
  question: followUpQuestion,
  status: "answered" as const,
}

const awaitingExchange = {
  answer: null,
  question: followUpQuestion,
  status: "awaitingAnswer" as const,
}

const evaluation = {
  dimensionScores: ["relevance", "structure", "specificity", "personalContribution"].map(
    (dimension) => ({ dimension, explanation: "说明", score: 80 }),
  ),
  evaluatedAt: "2026-08-11T08:02:00.000Z",
  overallScore: 80,
}

const review = {
  exposedWeaknesses: ["结果证据"],
  highlights: ["结构清晰"],
  improvementSuggestions: ["补充指标"],
  mainIssues: ["结果不足"],
  overallPerformance: "表现稳定。",
  recommendation: {
    action: "nextQuestion" as const,
    nextQuestion: {
      difficulty: "basic" as const,
      focusAreas: ["结果证据"],
      questionType: "projectDeepDive" as const,
    },
    reason: "继续练习结果表达。",
  },
  reusableAnswerStructure: ["背景、行动、结果"],
}

function createSession(status: "generatingQuestion" | "answering" = "generatingQuestion") {
  const base = {
    attemptId,
    attemptNumber: 1,
    language: "zh-CN" as const,
    selection,
    sessionId,
    startedAt: "2026-08-11T08:00:00.000Z",
    version: 1,
  }
  return status === "generatingQuestion" ? { ...base, status } : { ...base, question, status }
}

function createFollowUpSession(
  status: "generatingFollowUp" | "answeringFollowUp" | "evaluating" | "review",
) {
  const base = {
    attemptId,
    attemptNumber: 1,
    language: "zh-CN" as const,
    selection,
    sessionId,
    startedAt: "2026-08-11T08:00:00.000Z",
    version: 3,
  }
  const exchanges = status === "generatingFollowUp" ? [] : [answeredExchange]
  const common = {
    ...base,
    followUpExchanges: exchanges,
    mainAnswer,
    question,
  }
  if (status === "generatingFollowUp") return { ...common, status }
  if (status === "answeringFollowUp") {
    return {
      ...common,
      currentFollowUp: awaitingExchange,
      followUpExchanges: [],
      status,
    }
  }
  if (status === "evaluating") {
    return {
      ...common,
      followUpCompletion: { reason: "allAnswered" as const, status: "completed" as const },
      status,
      submittedAt: "2026-08-11T08:02:00.000Z",
    }
  }
  return {
    ...common,
    evaluation,
    followUpCompletion: { reason: "allAnswered" as const, status: "completed" as const },
    review,
    status,
  }
}

describe("practice wire schemas", () => {
  it("accepts setup selection and both active session states", () => {
    expect(practiceSessionSelectionSchema.parse(selection)).toEqual(selection)
    expect(practiceActiveSessionResponseSchema.parse(createSession())).toMatchObject({
      status: "generatingQuestion",
    })
    expect(practiceActiveSessionResponseSchema.parse(createSession("answering"))).toMatchObject({
      status: "answering",
      question,
    })
  })

  it("accepts all six backend active session states", () => {
    for (const status of [
      "generatingQuestion",
      "answering",
      "generatingFollowUp",
      "answeringFollowUp",
      "evaluating",
      "review",
    ] as const) {
      const payload =
        status === "generatingQuestion"
          ? createSession()
          : status === "answering"
            ? createSession("answering")
            : createFollowUpSession(status)
      expect(practiceActiveSessionResponseSchema.parse(payload).status).toBe(status)
    }
  })

  it("accepts the exact answer, follow-up, completion, evaluation, and review wires", () => {
    expect(practiceAnswerSchema.parse(mainAnswer)).toEqual(mainAnswer)
    expect(practiceFollowUpQuestionSchema.parse(followUpQuestion)).toEqual(followUpQuestion)
    expect(practiceAnsweredFollowUpExchangeSchema.parse(answeredExchange)).toEqual(answeredExchange)
    expect(practiceAwaitingFollowUpExchangeSchema.parse(awaitingExchange)).toEqual(awaitingExchange)
    expect(
      practiceCompletedFollowUpCompletionSchema.parse({
        reason: "noFollowUpRequired",
        status: "completed",
      }),
    ).toEqual({ reason: "noFollowUpRequired", status: "completed" })
    expect(practiceEvaluationSchema.parse(evaluation)).toEqual(evaluation)
    expect(practiceReviewSchema.parse(review)).toEqual(review)
    expect(
      practiceRecommendationSchema.parse({ action: "retryCurrent", reason: "继续练习。" }),
    ).toEqual({ action: "retryCurrent", reason: "继续练习。" })
  })

  it("accepts every public question type, difficulty, source, and material type", () => {
    for (const questionType of [
      "projectDeepDive",
      "behavioral",
      "businessUnderstanding",
      "motivation",
      "technicalFoundation",
    ] as const) {
      expect(practiceQuestionSchema.parse({ ...question, questionType }).questionType).toBe(
        questionType,
      )
    }
    for (const difficulty of ["basic", "pressure"] as const) {
      expect(practiceSessionSelectionSchema.parse({ ...selection, difficulty }).difficulty).toBe(
        difficulty,
      )
    }
    for (const source of ["personalized", "saved", "history"] as const) {
      expect(practiceSessionSelectionSchema.parse({ ...selection, source }).source).toBe(source)
    }
    for (const type of ["projectExperience", "workExperience"] as const) {
      expect(
        practiceQuestionSchema.parse({
          ...question,
          recommendedMaterials: [{ ...question.recommendedMaterials[0], type }],
        }).recommendedMaterials[0]?.type,
      ).toBe(type)
    }
  })

  it("accepts null, generating, and answering current sessions", () => {
    expect(currentPracticeSessionResponseSchema.parse({ session: null })).toEqual({ session: null })
    expect(
      currentPracticeSessionResponseSchema.parse({ session: createSession() }).session?.status,
    ).toBe("generatingQuestion")
    expect(
      currentPracticeSessionResponseSchema.parse({ session: createSession("answering") }).session
        ?.status,
    ).toBe("answering")
  })

  it("rejects internal lineage, template metadata, and unknown wire fields", () => {
    expect(() =>
      practiceQuestionSchema.parse({
        ...question,
        templateId: "projectDeepDive.performanceOptimization",
      }),
    ).toThrow()
    expect(() =>
      practiceFollowUpQuestionSchema.parse({ ...followUpQuestion, templateId }),
    ).toThrow()
    expect(() => practiceEvaluationSchema.parse({ ...evaluation, focusAssessments: [] })).toThrow()
    expect(() =>
      practiceAnswerSchema.parse({ ...mainAnswer, agentRunId: "internal-run" }),
    ).toThrow()
    expect(() =>
      practiceActiveSessionResponseSchema.parse({
        ...createSession(),
        runId: "internal-run",
      }),
    ).toThrow()
    expect(() =>
      practiceQuestionSchema.parse({
        ...question,
        recommendedMaterials: [{ ...question.recommendedMaterials[0], raw: "not allowed" }],
      }),
    ).toThrow()
  })

  it("rejects invalid UUIDs and unsupported enum values", () => {
    expect(() =>
      practiceSessionSelectionSchema.parse({ ...selection, targetRoleId: "role-1" }),
    ).toThrow()
    expect(() =>
      practiceActiveSessionResponseSchema.parse({ ...createSession(), status: "pending" }),
    ).toThrow()
    expect(() => practiceQuestionSchema.parse({ ...question, difficulty: "advanced" })).toThrow()
    const { prompt: _prompt, ...missingPrompt } = question
    expect(() => practiceQuestionSchema.parse(missingPrompt)).toThrow()
  })

  it("rejects awaiting exchanges in answered lists and malformed completion chains", () => {
    expect(() =>
      practiceActiveSessionResponseSchema.parse({
        ...createFollowUpSession("generatingFollowUp"),
        followUpExchanges: [awaitingExchange],
      }),
    ).toThrow()
    expect(() =>
      practiceActiveSessionResponseSchema.parse({
        ...createFollowUpSession("evaluating"),
        followUpExchanges: [],
      }),
    ).toThrow()
    expect(() =>
      practiceActiveSessionResponseSchema.parse({
        ...createFollowUpSession("evaluating"),
        followUpCompletion: { reason: "noFollowUpRequired", status: "completed" },
        followUpExchanges: [answeredExchange],
      }),
    ).toThrow()
    expect(() =>
      practiceActiveSessionResponseSchema.parse({
        ...createFollowUpSession("review"),
        followUpExchanges: [
          answeredExchange,
          { ...answeredExchange, question: { ...followUpQuestion, order: 2 } },
        ],
      }),
    ).toThrow()
  })
})
