import { describe, expect, it } from "vitest"

import {
  createGeneratedPracticeQuestionGuidance,
  createGeneratedPracticeQuestion,
  createPracticeFollowUpQuestion,
  createPracticeMockResponse,
  getPracticeFollowUpPrompts,
  practiceResponseMock,
  type PracticeMockScenario,
} from "@/mocks/data/practice"
import type {
  ActivePracticeSelection,
  PracticeGuidance,
  PracticeFollowUpCompletion,
  PracticeFollowUpQuestion,
  PracticePageResponse,
  PracticeQuestionCard,
  PracticeQuestionType,
  PracticeScoreDimension,
} from "@/models/practice"

const scenarios: PracticeMockScenario[] = [
  "setupReady",
  "noRoles",
  "noEligibleSavedQuestions",
  "noEligibleHistoryQuestions",
  "generatingQuestion",
  "answeringQuestion",
  "answeringHintRevealed",
  "answeringFrameworkRevealed",
  "answeringSavedQuestion",
  "answeringWeakQuestion",
  "answeringFirstFollowUp",
  "answeringSingleFollowUp",
  "answeringFollowUp",
  "evaluatingNoFollowUp",
  "evaluatingFollowUpEndedEarly",
  "evaluatingAnswer",
  "reviewRetryRecommended",
  "reviewNextRecommended",
  "completedSession",
]

const scoreDimensions = new Set<PracticeScoreDimension>([
  "relevance",
  "structure",
  "specificity",
  "personalContribution",
  "resultsAndEvidence",
  "roleAlignment",
  "communication",
  "riskControl",
])

const questionTypes: PracticeQuestionType[] = [
  "projectDeepDive",
  "behavioral",
  "businessUnderstanding",
  "motivation",
  "technicalFoundation",
]

function expectConsistentGuidance(guidance: PracticeGuidance<string[]>) {
  switch (guidance.status) {
    case "notRequested":
    case "unavailable":
      expect(guidance.content).toBeNull()
      return
    case "revealed":
      expect(guidance.content).not.toHaveLength(0)
  }
}

function expectUnrequestedGuidance(question: PracticeQuestionCard) {
  expect(question.answerHints).toEqual({ status: "notRequested", content: null })
  expect(question.answerFramework).toEqual({ status: "notRequested", content: null })
}

function expectFollowUpQuestionMatchesPlan(
  question: PracticeQuestionCard,
  followUp: PracticeFollowUpQuestion,
) {
  const prompts = getPracticeFollowUpPrompts(question.questionType)
  expect(followUp.order).toBeGreaterThan(0)
  expect(followUp.order).toBeLessThanOrEqual(prompts.length)
  expect(followUp.prompt).toBe(prompts[followUp.order - 1])
  expect(followUp.id).toBe(`${question.id}_follow_up_${followUp.order}`)
}

function expectCompletedFollowUpsMatchPlan({
  question,
  exchanges,
  completion,
}: {
  question: PracticeQuestionCard
  exchanges: Array<{ question: PracticeFollowUpQuestion; answer: { order: number } }>
  completion: PracticeFollowUpCompletion
}) {
  const prompts = getPracticeFollowUpPrompts(question.questionType)
  exchanges.forEach((exchange, index) => {
    expectFollowUpQuestionMatchesPlan(question, exchange.question)
    expect(exchange.question.order).toBe(index + 1)
    expect(exchange.answer.order).toBe(index + 2)
  })

  if (completion.status === "endedEarly") {
    expect(completion.unansweredQuestion.order).toBe(exchanges.length + 1)
    expectFollowUpQuestionMatchesPlan(question, completion.unansweredQuestion)
    return
  }

  if (completion.reason === "noFollowUpRequired") {
    expect(prompts).toHaveLength(0)
    expect(exchanges).toHaveLength(0)
    return
  }

  expect(exchanges).toHaveLength(prompts.length)
  expect(exchanges.map(({ question: followUp }) => followUp.order)).toEqual(
    prompts.map((_, index) => index + 1),
  )
}

function expectConsistentPracticeResponse(response: PracticePageResponse) {
  const { setupContext, session } = response

  for (const role of setupContext.targetRoles) {
    expect(role.supportedQuestionTypes.length).toBeGreaterThan(0)
    expect(new Set(role.supportedQuestionTypes).size).toBe(role.supportedQuestionTypes.length)
  }

  if (setupContext.defaultTargetRoleId !== null) {
    expect(
      setupContext.targetRoles.some((role) => role.id === setupContext.defaultTargetRoleId),
    ).toBe(true)
  }

  if (session.status === "setup") {
    expect("question" in session).toBe(false)
    expect("sessionId" in session).toBe(false)
    expect("version" in session).toBe(false)

    if (session.selection.targetRoleId !== null) {
      const selectedRole = setupContext.targetRoles.find(
        (role) => role.id === session.selection.targetRoleId,
      )
      expect(selectedRole).toBeDefined()
      expect(selectedRole?.supportedQuestionTypes).toContain(session.selection.questionType)
    }
    return
  }

  expect(session.selection.targetRoleId).toBeTypeOf("string")
  expect(Number.isInteger(session.version)).toBe(true)
  expect(session.version).toBeGreaterThan(0)

  const selectedRole = setupContext.targetRoles.find(
    (role) => role.id === session.selection.targetRoleId,
  )
  expect(selectedRole).toBeDefined()
  expect(selectedRole?.supportedQuestionTypes).toContain(session.selection.questionType)

  switch (session.status) {
    case "generatingQuestion":
      expect("question" in session).toBe(false)
      expect(session.sessionId).toMatch(/^practice_session_/)
      return
    case "answering":
      expect(session.question.id).toMatch(/^practice_question_/)
      expect(session.question.questionType).toBe(session.selection.questionType)
      expectConsistentGuidance(session.question.answerHints)
      expectConsistentGuidance(session.question.answerFramework)
      expect("mainAnswer" in session).toBe(false)
      expect("evaluation" in session).toBe(false)
      expect("review" in session).toBe(false)
      return
    case "answeringFollowUp":
      expect(session.question.questionType).toBe(session.selection.questionType)
      expectUnrequestedGuidance(session.question)
      expect(session.mainAnswer.order).toBe(1)
      expect(session.currentFollowUp.status).toBe("awaitingAnswer")
      expect(session.currentFollowUp.answer).toBeNull()
      expect(session.currentFollowUp.question.order).toBe(session.followUpExchanges.length + 1)
      expectFollowUpQuestionMatchesPlan(session.question, session.currentFollowUp.question)
      session.followUpExchanges.forEach((exchange, index) => {
        expectFollowUpQuestionMatchesPlan(session.question, exchange.question)
        expect(exchange.question.order).toBe(index + 1)
        expect(exchange.answer.order).toBe(index + 2)
      })
      expect(session.followUpExchanges.every((exchange) => exchange.status === "answered")).toBe(
        true,
      )
      expect("evaluation" in session).toBe(false)
      return
    case "evaluating":
      expect(session.question.questionType).toBe(session.selection.questionType)
      expectUnrequestedGuidance(session.question)
      expect(session.mainAnswer.content.trim()).not.toBe("")
      expect(session.followUpExchanges.every((exchange) => exchange.answer.content.trim())).toBe(
        true,
      )
      expect("evaluation" in session).toBe(false)
      expect("review" in session).toBe(false)
      expect("currentFollowUp" in session).toBe(false)
      if (session.followUpCompletion.status === "completed") {
        expect(["noFollowUpRequired", "allAnswered"]).toContain(session.followUpCompletion.reason)
      } else {
        expect(session.followUpCompletion.unansweredQuestion.prompt.trim()).not.toBe("")
      }
      expectCompletedFollowUpsMatchPlan({
        question: session.question,
        exchanges: session.followUpExchanges,
        completion: session.followUpCompletion,
      })
      return
    case "review": {
      const dimensions = session.evaluation.dimensionScores

      expect(session.question.questionType).toBe(session.selection.questionType)
      expectUnrequestedGuidance(session.question)
      expect(dimensions).toHaveLength(scoreDimensions.size)
      expect(new Set(dimensions.map(({ dimension }) => dimension))).toEqual(scoreDimensions)
      expect(dimensions.every(({ score }) => score >= 0 && score <= 100)).toBe(true)
      expect(session.evaluation.overallScore).toBeGreaterThanOrEqual(0)
      expect(session.evaluation.overallScore).toBeLessThanOrEqual(100)
      expect(session.review.overallPerformance.trim()).not.toBe("")
      expect(session.review.highlights).not.toHaveLength(0)
      expect(session.review.mainIssues).not.toHaveLength(0)
      expect(session.review.improvementSuggestions).not.toHaveLength(0)
      expect(session.review.reusableAnswerStructure).not.toHaveLength(0)
      expect(session.review.exposedWeaknesses).not.toHaveLength(0)
      expect("shouldRetry" in session.review).toBe(false)
      expect("currentFollowUp" in session).toBe(false)
      expectCompletedFollowUpsMatchPlan({
        question: session.question,
        exchanges: session.followUpExchanges,
        completion: session.followUpCompletion,
      })
      return
    }
    case "completed":
      expect(session.questionsCompleted).toBeGreaterThan(0)
      expect("question" in session).toBe(false)
      expect("mainAnswer" in session).toBe(false)
      expect("currentFollowUp" in session).toBe(false)
  }
}

describe("practice mock scenarios", () => {
  it("returns independent deterministic follow-up plans for every question type", () => {
    const expectedCounts: Record<PracticeQuestionType, number> = {
      projectDeepDive: 2,
      behavioral: 1,
      businessUnderstanding: 1,
      motivation: 0,
      technicalFoundation: 2,
    }

    for (const questionType of questionTypes) {
      const first = getPracticeFollowUpPrompts(questionType)
      const second = getPracticeFollowUpPrompts(questionType)
      expect(first).toHaveLength(expectedCounts[questionType])
      expect(first).not.toBe(second)

      if (first.length > 0) {
        first[0] = "Mutated follow-up"
        expect(second[0]).not.toBe("Mutated follow-up")
      }
    }
  })

  it("creates follow-up questions from the same plan without exposing future prompts", () => {
    const response = createPracticeMockResponse("answeringQuestion")
    if (response.session.status !== "answering") return
    const followUp = createPracticeFollowUpQuestion({
      question: response.session.question,
      order: 1,
      createdAt: "2026-07-20T02:00:00.000Z",
    })

    expectFollowUpQuestionMatchesPlan(response.session.question, followUp)
    expect("followUpPlan" in response.session).toBe(false)
    expect("futureFollowUps" in response.session).toBe(false)
  })

  it.each(questionTypes)(
    "generates stable %s questions from the active selection",
    (questionType) => {
      const selection = {
        targetRoleId: "role_frontend_bytedance",
        questionType,
        difficulty: "pressure",
        source: "personalized",
        prioritizeWeaknesses: false,
      } satisfies ActivePracticeSelection
      const first = createGeneratedPracticeQuestion({
        sessionId: "practice_session_factory",
        ordinal: 1,
        selection,
      })
      const second = createGeneratedPracticeQuestion({
        sessionId: "practice_session_factory",
        ordinal: 2,
        selection,
      })

      expect(first).toMatchObject({
        questionType,
        difficulty: "pressure",
        answerHints: { status: "notRequested", content: null },
        answerFramework: { status: "notRequested", content: null },
        isSaved: false,
        isMarkedWeak: false,
      })
      expect(first.id).toContain("practice_session_factory")
      expect(second.id).not.toBe(first.id)
      expect(second.prompt).not.toBe(first.prompt)
    },
  )

  it("marks saved-source generated questions as saved", () => {
    const selection = {
      targetRoleId: "role_frontend_bytedance",
      questionType: "projectDeepDive",
      difficulty: "basic",
      source: "saved",
      prioritizeWeaknesses: false,
    } satisfies ActivePracticeSelection

    expect(
      createGeneratedPracticeQuestion({
        sessionId: "practice_session_saved",
        ordinal: 1,
        selection,
      }).isSaved,
    ).toBe(true)
  })

  it.each(questionTypes)("provides safe, independent %s guidance", (questionType) => {
    const first = createGeneratedPracticeQuestionGuidance(questionType)
    const second = createGeneratedPracticeQuestionGuidance(questionType)
    const hiddenMaterialPattern = /参考答案|完整评分标准|内部追问策略/

    expect(first.hints).not.toHaveLength(0)
    expect(first.framework).not.toHaveLength(0)
    expect([...first.hints, ...first.framework].join(" ")).not.toMatch(hiddenMaterialPattern)
    expect(first.hints).not.toBe(second.hints)
    expect(first.framework).not.toBe(second.framework)

    first.hints[0] = "Mutated hint"
    first.framework[0] = "Mutated framework"
    expect(second.hints[0]).not.toBe("Mutated hint")
    expect(second.framework[0]).not.toBe("Mutated framework")
  })

  it("keeps question-type guidance semantically distinct", () => {
    const behavioral = createGeneratedPracticeQuestionGuidance("behavioral")
    const motivation = createGeneratedPracticeQuestionGuidance("motivation")
    const technical = createGeneratedPracticeQuestionGuidance("technicalFoundation")

    expect(behavioral.hints.join(" ")).toMatch(/情境|冲突|挑战|协作|复盘/)
    expect(behavioral.framework.join(" ")).toContain("Situation")
    expect(motivation.hints.join(" ")).toMatch(/岗位|经历|价值|职业发展/)
    expect(motivation.hints.join(" ")).not.toContain("性能问题")
    const technicalContent = [...technical.hints, ...technical.framework].join(" ")
    for (const concept of ["原理", "方案", "权衡", "验证"]) {
      expect(technicalContent).toContain(concept)
    }
  })
  it.each(scenarios)("keeps the %s response internally consistent", (scenario) => {
    expectConsistentPracticeResponse(createPracticeMockResponse(scenario))
  })

  it("keeps answering state free of evaluation results", () => {
    const { session } = createPracticeMockResponse("answeringQuestion")

    expect(session.status).toBe("answering")
    expect("evaluation" in session).toBe(false)
    expect("review" in session).toBe(false)
  })

  it("does not reveal answer guidance in ordinary question snapshots", () => {
    const scenarioNames: PracticeMockScenario[] = [
      "answeringQuestion",
      "answeringFirstFollowUp",
      "answeringSingleFollowUp",
      "answeringFollowUp",
      "evaluatingNoFollowUp",
      "evaluatingFollowUpEndedEarly",
      "evaluatingAnswer",
      "reviewRetryRecommended",
      "reviewNextRecommended",
    ]

    for (const scenario of scenarioNames) {
      const { session } = createPracticeMockResponse(scenario)
      if (!("question" in session)) {
        throw new Error(`${scenario} must include a question.`)
      }
      expectUnrequestedGuidance(session.question)
    }
  })

  it("stores revealed hint and framework content in dedicated scenarios", () => {
    const hint = createPracticeMockResponse("answeringHintRevealed")
    const framework = createPracticeMockResponse("answeringFrameworkRevealed")
    if (hint.session.status !== "answering" || framework.session.status !== "answering") return

    expect(hint.session.question.answerHints.status).toBe("revealed")
    expect(hint.session.question.answerHints.content).not.toHaveLength(0)
    expect(hint.session.question.answerFramework).toEqual({
      status: "notRequested",
      content: null,
    })
    expect(framework.session.question.answerFramework.status).toBe("revealed")
    expect(framework.session.question.answerFramework.content).not.toHaveLength(0)
    expect(framework.session.question.answerHints).toEqual({
      status: "notRequested",
      content: null,
    })
  })

  it("uses content only for revealed guidance", () => {
    const notRequested = {
      status: "notRequested",
      content: null,
    } satisfies PracticeGuidance<string[]>
    const unavailable = {
      status: "unavailable",
      content: null,
    } satisfies PracticeGuidance<string[]>
    const revealed = {
      status: "revealed",
      content: ["先说明背景，再说明个人行动。"],
    } satisfies PracticeGuidance<string[]>

    expectConsistentGuidance(notRequested)
    expectConsistentGuidance(unavailable)
    expectConsistentGuidance(revealed)
    expect(notRequested.content).toBeNull()
    expect(unavailable.content).toBeNull()
    expect(revealed.content).toEqual(["先说明背景，再说明个人行动。"])
  })

  it("keeps a main answer and an unanswered current follow-up in follow-up state", () => {
    const { session } = createPracticeMockResponse("answeringFollowUp")

    expect(session.status).toBe("answeringFollowUp")
    if (session.status !== "answeringFollowUp") return

    expect(session.mainAnswer.content).toBeTruthy()
    expect(session.currentFollowUp.answer).toBeNull()
  })

  it("does not expose review data while an answer is being evaluated", () => {
    const { session } = createPracticeMockResponse("evaluatingAnswer")

    expect(session.status).toBe("evaluating")
    expect("evaluation" in session).toBe(false)
    expect("review" in session).toBe(false)
  })

  it("uses recommendation action as the only retry decision", () => {
    const retry = createPracticeMockResponse("reviewRetryRecommended")
    const next = createPracticeMockResponse("reviewNextRecommended")

    expect(retry.session.status).toBe("review")
    expect(next.session.status).toBe("review")
    if (retry.session.status !== "review" || next.session.status !== "review") return

    expect(retry.session.review.recommendation.action).toBe("retryCurrent")
    expect(next.session.review.recommendation.action).toBe("nextQuestion")
    expect("shouldRetry" in retry.session.review).toBe(false)
    expect("shouldRetry" in next.session.review).toBe(false)
  })

  it("keeps the default question type supported by the default target role", () => {
    const response = createPracticeMockResponse("setupReady")
    const { defaultTargetRoleId } = response.setupContext
    const defaultRole = response.setupContext.targetRoles.find(
      (role) => role.id === defaultTargetRoleId,
    )

    expect(defaultRole).toBeDefined()
    expect(defaultRole?.supportedQuestionTypes).toContain(response.session.selection.questionType)
    expect(response.session.selection.prioritizeWeaknesses).toBe(false)
  })

  it("declares role-specific supported question types", () => {
    const { targetRoles } = createPracticeMockResponse().setupContext
    const frontendRole = targetRoles.find((role) => role.id === "role_frontend_bytedance")
    const productRole = targetRoles.find((role) => role.id === "role_product_manager_meituan")

    expect(frontendRole?.supportedQuestionTypes).toEqual([
      "projectDeepDive",
      "behavioral",
      "businessUnderstanding",
      "motivation",
      "technicalFoundation",
    ])
    expect(productRole?.supportedQuestionTypes).toEqual([
      "projectDeepDive",
      "behavioral",
      "businessUnderstanding",
      "motivation",
    ])
  })

  it("keeps empty source scenarios aligned with their selected source", () => {
    const saved = createPracticeMockResponse("noEligibleSavedQuestions")
    const history = createPracticeMockResponse("noEligibleHistoryQuestions")

    expect(saved.session.selection.source).toBe("saved")
    expect(saved.setupContext.eligibleQuestionCounts.saved).toBe(0)
    expect(history.session.selection.source).toBe("history")
    expect(history.setupContext.eligibleQuestionCounts.history).toBe(0)
  })

  it("does not select a default role when no roles exist", () => {
    const response = createPracticeMockResponse("noRoles")

    expect(response.setupContext.targetRoles).toEqual([])
    expect(response.setupContext.defaultTargetRoleId).toBeNull()
    expect(response.session.selection.targetRoleId).toBeNull()
  })

  it("returns an independent deep copy for every request", () => {
    const first = createPracticeMockResponse()
    const second = createPracticeMockResponse()

    expect(first).toEqual(practiceResponseMock)
    expect(second).toEqual(practiceResponseMock)
    expect(first).not.toBe(second)
    expect(first.setupContext).not.toBe(second.setupContext)
    expect(first.setupContext.targetRoles).not.toBe(second.setupContext.targetRoles)
  })

  it("does not leak fixture mutations into later requests", () => {
    const first = createPracticeMockResponse("answeringQuestion")
    const firstRole = first.setupContext.targetRoles[0]

    if (!firstRole) {
      throw new Error("The answering fixture must include a target role.")
    }
    firstRole.title = "Mutated role"
    if (first.session.status !== "answering") {
      throw new Error("The answering fixture must use the answering state.")
    }
    first.session.question.assessedCapabilities[0] = "Mutated capability"

    const second = createPracticeMockResponse("answeringQuestion")

    expect(second.setupContext.targetRoles[0]?.title).toBe("Senior Frontend Engineer")
    expect(second.session.status).toBe("answering")
    if (second.session.status === "answering") {
      expect(second.session.question.assessedCapabilities[0]).toBe("问题分析")
    }
  })
})
