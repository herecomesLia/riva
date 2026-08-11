import { describe, expect, it } from "vitest"

import {
  currentPracticeSessionResponseSchema,
  practiceActiveSessionResponseSchema,
  practiceQuestionSchema,
  practiceSessionSelectionSchema,
} from "./practice"

const roleId = "11111111-1111-4111-8111-111111111111"
const sessionId = "22222222-2222-4222-8222-222222222222"
const attemptId = "33333333-3333-4333-8333-333333333333"
const questionId = "44444444-4444-4444-8444-444444444444"
const materialId = "55555555-5555-4555-8555-555555555555"

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
})
