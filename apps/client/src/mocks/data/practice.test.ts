import { describe, expect, it } from "vitest"

import {
  createGeneratedPracticeQuestionGuidance,
  createGeneratedPracticeQuestion,
  createPracticeFollowUpQuestion,
  createPracticeFollowUpReferenceAnswer,
  createPracticeMockEvaluationResult,
  createPracticeMockResponse,
  createPracticeReferenceAnswer,
  getPracticeFollowUpPlan,
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
  PracticeQuestionTemplateId,
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
  "reviewBalanced",
  "reviewHighScore",
  "reviewLowScore",
  "reviewLongContent",
  "reviewNoNewWeaknesses",
  "reviewMotivation",
  "reviewFollowUpEndedEarly",
  "completedSession",
  "retryingCurrentQuestion",
  "generatingNextQuestion",
  "completedWithRetries",
  "completedWithWeakQuestions",
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

const templateIds = [
  "projectDeepDive.performanceOptimization",
  "projectDeepDive.complexProjectTradeoff",
  "behavioral.stakeholderConflict",
  "behavioral.incidentUnderPressure",
  "businessUnderstanding.priorityAdjustment",
  "businessUnderstanding.experienceVsRevenueTradeoff",
  "motivation.roleMotivation",
  "motivation.careerDirection",
  "technicalFoundation.reactRepeatedRendering",
  "technicalFoundation.requestLayerDesign",
] as const satisfies readonly PracticeQuestionTemplateId[]

function referenceForQuestion(question: PracticeQuestionCard) {
  return createPracticeReferenceAnswer({
    templateId: question.templateId,
    questionType: question.questionType,
    targetRoleTitle: "Senior Frontend Engineer",
    questionPrompt: question.prompt,
    recommendedMaterials: question.recommendedMaterials,
  })
}

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

function expectConsistentReferenceAnswer(question: PracticeQuestionCard) {
  expect(question.templateId.startsWith(`${question.questionType}.`)).toBe(true)
  const state = question.referenceAnswer
  if (state.status === "revealed") {
    expect(state.content.answer.trim()).not.toBe("")
    expect(state.content.kind).toBe(
      question.questionType === "technicalFoundation"
        ? "technicalReference"
        : "personalizedExample",
    )
    return
  }
  expect(state.content).toBeNull()
  expect(state.viewedBeforeSubmission).toBe(false)
}

function expectFollowUpQuestionMatchesPlan(
  question: PracticeQuestionCard,
  followUp: PracticeFollowUpQuestion,
) {
  const templates = getPracticeFollowUpPlan(question.templateId)
  expect(followUp.order).toBeGreaterThan(0)
  expect(followUp.order).toBeLessThanOrEqual(templates.length)
  expect(followUp.prompt).toBe(templates[followUp.order - 1]?.prompt)
  expect(followUp.templateId).toBe(templates[followUp.order - 1]?.id)
  expect(followUp.id).toBe(`${question.id}_follow_up_${followUp.order}`)
  expect(followUp.templateId.startsWith(`${question.templateId}.`)).toBe(true)
  expectConsistentGuidance(followUp.answerHints)
  expectConsistentGuidance(followUp.answerFramework)
  const reference = followUp.referenceAnswer
  if (reference.status === "revealed") {
    expect(reference.content.answer.trim()).not.toBe("")
  } else {
    expect(reference.content).toBeNull()
    expect(reference.viewedBeforeSubmission).toBe(false)
  }
  if (reference.viewedBeforeSubmission) expect(reference.status).toBe("revealed")
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
  const templates = getPracticeFollowUpPlan(question.templateId)
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
    expect(templates).toHaveLength(0)
    expect(exchanges).toHaveLength(0)
    return
  }

  expect(exchanges).toHaveLength(templates.length)
  expect(exchanges.map(({ question: followUp }) => followUp.order)).toEqual(
    templates.map((_, index) => index + 1),
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
    for (const field of [
      "sessionId",
      "version",
      "attemptId",
      "attemptNumber",
      "attemptRecords",
      "question",
      "mainAnswer",
      "followUpExchanges",
      "evaluation",
      "review",
      "completedAt",
      "questionsCompleted",
      "retryCount",
      "savedQuestionCount",
      "markedWeakQuestionCount",
      "finalAttemptAverageScore",
      "nextStepSuggestion",
    ]) {
      expect(field in session).toBe(false)
    }

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
  expect(Number.isInteger(session.attemptNumber)).toBe(true)
  expect(session.attemptNumber).toBeGreaterThan(0)
  expect(session.attemptId).toBe(`${session.sessionId}_attempt_${session.attemptNumber}`)
  expect(session.attemptRecords.map((record) => record.attemptNumber)).toEqual(
    session.attemptRecords.map((_, index) => index + 1),
  )
  expect(new Set(session.attemptRecords.map((record) => record.attemptId)).size).toBe(
    session.attemptRecords.length,
  )
  session.attemptRecords.forEach((record) => expectConsistentReferenceAnswer(record.question))
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
      expectConsistentReferenceAnswer(session.question)
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
      expect(session.currentFollowUp.question.answerHints).toEqual({
        status: "notRequested",
        content: null,
      })
      expect(session.currentFollowUp.question.answerFramework).toEqual({
        status: "notRequested",
        content: null,
      })
      expect(session.currentFollowUp.question.referenceAnswer).toEqual({
        status: "notRequested",
        content: null,
        viewedBeforeSubmission: false,
      })
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
      expectConsistentReferenceAnswer(session.question)
      expect(session.question.referenceAnswer.status).toBe("revealed")
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
      expect(session.review.exposedWeaknesses.every((item) => item.trim())).toBe(true)
      expect("shouldRetry" in session.review).toBe(false)
      expect("currentFollowUp" in session).toBe(false)
      expect("submittedAt" in session).toBe(false)
      expect(session.attemptRecords.some((record) => record.attemptId === session.attemptId)).toBe(
        false,
      )
      expectCompletedFollowUpsMatchPlan({
        question: session.question,
        exchanges: session.followUpExchanges,
        completion: session.followUpCompletion,
      })
      for (const exchange of session.followUpExchanges) {
        expect(exchange.question.referenceAnswer.status).toBe("revealed")
      }
      if (session.followUpCompletion.status === "endedEarly") {
        expect(session.followUpCompletion.unansweredQuestion.referenceAnswer.status).toBe(
          "revealed",
        )
      }
      return
    }
    case "completed": {
      const latest = new Map(session.attemptRecords.map((record) => [record.question.id, record]))
      const records = session.attemptRecords
      expect(session.questionsCompleted).toBe(latest.size)
      expect(session.retryCount).toBe(records.length - latest.size)
      expect(session.savedQuestionCount).toBe(
        [...latest.values()].filter((record) => record.question.isSaved).length,
      )
      expect(session.markedWeakQuestionCount).toBe(
        [...latest.values()].filter((record) => record.question.isMarkedWeak).length,
      )
      expect(session.finalAttemptAverageScore).toBe(
        latest.size === 0
          ? 0
          : Math.round(
              [...latest.values()].reduce(
                (sum, record) => sum + record.evaluation.overallScore,
                0,
              ) / latest.size,
            ),
      )
      expect("question" in session).toBe(false)
      expect("mainAnswer" in session).toBe(false)
      expect("currentFollowUp" in session).toBe(false)
      return
    }
  }
}

describe("practice mock scenarios", () => {
  it("maps all ten stable template IDs to unique, type-correct reference answers", () => {
    const generatedIds: PracticeQuestionTemplateId[] = []
    const answers = new Map<PracticeQuestionTemplateId, string>()
    for (const questionType of questionTypes) {
      const selection = {
        targetRoleId: "role_frontend_bytedance",
        questionType,
        difficulty: "basic",
        source: "personalized",
        prioritizeWeaknesses: false,
      } satisfies ActivePracticeSelection
      const typeAnswers: string[] = []
      for (const ordinal of [1, 2]) {
        const question = createGeneratedPracticeQuestion({
          sessionId: `template_${questionType}`,
          ordinal,
          selection,
        })
        const first = referenceForQuestion(question)
        generatedIds.push(question.templateId)
        answers.set(question.templateId, first.answer)
        typeAnswers.push(first.answer)
        expect(referenceForQuestion(question)).toEqual(first)
        expect(question.templateId.startsWith(`${question.questionType}.`)).toBe(true)
        expect(first.answer.trim()).not.toBe("")
        expect(first.keyPoints.length).toBeGreaterThan(0)
        expect(first.commonMistakes.length).toBeGreaterThan(0)
        expect(first.kind).toBe(
          questionType === "technicalFoundation" ? "technicalReference" : "personalizedExample",
        )
      }
      expect(typeAnswers[0]).not.toBe(typeAnswers[1])
    }
    expect(generatedIds).toEqual(templateIds)
    expect(new Set(answers.values()).size).toBe(templateIds.length)

    const react = answers.get("technicalFoundation.reactRepeatedRendering") ?? ""
    const requestLayer = answers.get("technicalFoundation.requestLayerDesign") ?? ""
    expect(react).toMatch(/Profiler|重复渲染/)
    expect(requestLayer).toMatch(/类型安全/)
    expect(requestLayer).toMatch(/缓存 key|缓存/)
    expect(requestLayer).toMatch(/错误边界|错误分类/)
    expect(requestLayer).not.toBe(react)
  })

  it("does not include hidden reference content on a new question", () => {
    const response = createPracticeMockResponse("answeringQuestion")
    if (response.session.status !== "answering") return
    expect(response.session.question.referenceAnswer).toEqual({
      status: "notRequested",
      content: null,
      viewedBeforeSubmission: false,
    })
  })
  it("returns deterministic follow-up plans for every concrete main question template", () => {
    for (const templateId of templateIds) {
      const plan = getPracticeFollowUpPlan(templateId)
      expect(plan).toHaveLength(
        templateId.startsWith("motivation.")
          ? 0
          : templateId.includes("projectDeepDive") || templateId.includes("technicalFoundation")
            ? 2
            : 1,
      )
      for (const template of plan) {
        expect(template.id.startsWith(`${templateId}.`)).toBe(true)
        expect(template.prompt.trim()).not.toBe("")
        expect(template.answerHints.length).toBeGreaterThan(0)
        expect(template.answerFramework.length).toBeGreaterThan(0)
        expect(template.referenceAnswer.answer.trim()).not.toBe("")
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

  it("creates distinct contextual supplements for concrete follow-up templates", () => {
    const cases = [
      ["projectDeepDive", 1, 1],
      ["projectDeepDive", 2, 1],
      ["behavioral", 2, 1],
      ["businessUnderstanding", 2, 1],
      ["technicalFoundation", 1, 1],
      ["technicalFoundation", 2, 1],
      ["technicalFoundation", 2, 2],
    ] as const satisfies readonly (readonly [PracticeQuestionType, number, number])[]
    const answers = cases.map(([questionType, ordinal, order]) => {
      const mainQuestion = createGeneratedPracticeQuestion({
        sessionId: `context_${questionType}_${ordinal}`,
        ordinal,
        selection: {
          targetRoleId: "role_frontend_bytedance",
          questionType,
          difficulty: "pressure",
          source: "personalized",
          prioritizeWeaknesses: false,
        },
      })
      const currentFollowUp = createPracticeFollowUpQuestion({
        question: mainQuestion,
        order,
        createdAt: "2026-07-20T03:00:00.000Z",
      })
      return createPracticeFollowUpReferenceAnswer({
        mainQuestion,
        mainAnswer: {
          id: `answer_${ordinal}_${order}`,
          content: "这是用户基于真实经历给出的主回答。",
          createdAt: "2026-07-20T02:59:00.000Z",
          order: 1,
        },
        previousFollowUpExchanges: [],
        currentFollowUp,
        targetRoleTitle: "Senior Frontend Engineer",
      }).answer
    })

    expect(new Set(answers).size).toBe(answers.length)
    expect(answers[2]).not.toContain("重新处理这次冲突")
    expect(`${answers[5]} ${answers[6]}`).toMatch(/缓存|一致性|竞态|降级|恢复/)
    expect(answers[4]).toMatch(/Profiler|Strict Mode|生产构建/)
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
      expect(first.templateId.startsWith(`${questionType}.`)).toBe(true)
      expect(second.templateId.startsWith(`${questionType}.`)).toBe(true)
      expect(second.templateId).not.toBe(first.templateId)
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
      "reviewBalanced",
      "reviewHighScore",
      "reviewLowScore",
      "reviewLongContent",
      "reviewNoNewWeaknesses",
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

  it("returns independent mock evaluation results", () => {
    const response = createPracticeMockResponse("evaluatingAnswer")
    if (response.session.status !== "evaluating") {
      throw new Error("An evaluating fixture is required.")
    }
    const first = createPracticeMockEvaluationResult(response.session)
    const second = createPracticeMockEvaluationResult(response.session)

    const firstDimension = first.evaluation.dimensionScores[0]
    if (!firstDimension) throw new Error("A mock evaluation must include score dimensions.")
    firstDimension.explanation = "Mutated explanation"
    first.review.highlights[0] = "Mutated highlight"
    expect(second.evaluation.dimensionScores[0]?.explanation).not.toBe("Mutated explanation")
    expect(second.review.highlights[0]).not.toBe("Mutated highlight")
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
