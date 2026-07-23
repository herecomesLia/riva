import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createPracticeMockResponse, getPracticeFollowUpPlan } from "@/mocks/data/practice"
import { reconcilePracticeSetupSelection, resetPracticeMockState } from "@/mocks/services/practice"
import { resetRolesMockState } from "@/mocks/services/roles"
import {
  endPracticeFollowUps,
  getPracticePage,
  getPracticeEvaluationStatus,
  getQuestionGenerationStatus,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  requestPracticeReferenceAnswer,
  requestPracticeFollowUpFramework,
  requestPracticeFollowUpHint,
  requestPracticeFollowUpReferenceAnswer,
  retryPracticeEvaluation,
  retryCurrentPracticeQuestion,
  continueToNextPracticeQuestion,
  endPracticeSession,
  prepareNextPracticeSession,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession,
  submitFollowUpAnswer,
  submitPrimaryAnswer,
} from "@/services/practice"
import {
  createTargetRole,
  deleteTargetRole,
  getRolesPage,
  setCurrentTargetRole,
} from "@/services/roles"
import type {
  PracticeAnsweringState,
  PracticeQuestionType,
  PracticeReferenceAnswer,
  PracticeReviewState,
} from "@/models/practice"
import { isCurrentPracticeAttemptRetry } from "@/pages/practice/practice-attempt"

beforeEach(() => {
  vi.useFakeTimers()
  resetRolesMockState("multipleRoles")
  resetPracticeMockState()
})

afterEach(() => {
  vi.useRealTimers()
})

async function settle<T>(promise: Promise<T>) {
  await vi.runAllTimersAsync()
  return promise
}

async function generateQuestion(
  questionType: PracticeQuestionType,
): Promise<PracticeAnsweringState> {
  const setup = await settle(getPracticePage())
  const targetRoleId = setup.setupContext.defaultTargetRoleId
  if (!targetRoleId) throw new Error("The default practice setup must include a current role.")
  const generating = await settle(
    startPracticeSession({ ...setup.session.selection, targetRoleId, questionType }),
  )
  if (generating.session.status !== "generatingQuestion") {
    throw new Error("The practice session must be generating a question.")
  }
  const input = {
    sessionId: generating.session.sessionId,
    version: generating.session.version,
  }
  await settle(getQuestionGenerationStatus(input))
  const response = await settle(getQuestionGenerationStatus(input))
  if (response.session.status !== "answering") {
    throw new Error("Question generation must produce an answering session.")
  }
  return response.session
}

async function completeQuestionToReview(
  questionType: PracticeQuestionType,
  options: { endFollowUpsEarly?: boolean } = {},
): Promise<PracticeReviewState> {
  const initial = await generateQuestion(questionType)
  let response = await settle(
    submitPrimaryAnswer({
      sessionId: initial.sessionId,
      version: initial.version,
      questionId: initial.question.id,
      content: "我会说明具体背景、个人判断、协作动作和可验证的结果。",
    }),
  )

  while (response.session.status === "answeringFollowUp") {
    const session = response.session
    if (options.endFollowUpsEarly) {
      response = await settle(
        endPracticeFollowUps({
          sessionId: session.sessionId,
          version: session.version,
          questionId: session.question.id,
          followUpQuestionId: session.currentFollowUp.question.id,
        }),
      )
      break
    }
    response = await settle(
      submitFollowUpAnswer({
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.question.id,
        followUpQuestionId: session.currentFollowUp.question.id,
        content: "我补充说明具体证据、方案取舍、验证方式和风险控制。",
      }),
    )
  }

  if (response.session.status !== "evaluating") {
    throw new Error("A completed answer must enter evaluation.")
  }
  const submittedAt = response.session.submittedAt
  const input = {
    sessionId: response.session.sessionId,
    version: response.session.version,
    questionId: response.session.question.id,
  }
  await settle(getPracticeEvaluationStatus(input))
  const completed = await settle(getPracticeEvaluationStatus(input))
  if (completed.session.status !== "review") {
    throw new Error("Evaluation must produce a review.")
  }
  if (Date.parse(completed.session.evaluation.evaluatedAt) < Date.parse(submittedAt)) {
    throw new Error("Evaluation must not be timestamped before answer submission.")
  }
  return completed.session
}

async function finishCurrentAttempt(initial: PracticeAnsweringState): Promise<PracticeReviewState> {
  let response = await settle(
    submitPrimaryAnswer({
      sessionId: initial.sessionId,
      version: initial.version,
      questionId: initial.question.id,
      content: "我会说明背景、个人行动、证据、取舍和结果。",
    }),
  )
  while (response.session.status === "answeringFollowUp") {
    const session = response.session
    response = await settle(
      submitFollowUpAnswer({
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.question.id,
        followUpQuestionId: session.currentFollowUp.question.id,
        content: "我补充关键证据、协作取舍和风险控制。",
      }),
    )
  }
  if (response.session.status !== "evaluating") throw new Error("Expected evaluating session.")
  const input = {
    sessionId: response.session.sessionId,
    version: response.session.version,
    questionId: response.session.question.id,
  }
  await settle(getPracticeEvaluationStatus(input))
  const reviewed = await settle(getPracticeEvaluationStatus(input))
  if (reviewed.session.status !== "review") throw new Error("Expected review session.")
  return reviewed.session
}

async function continueToSecondQuestion(
  questionType: PracticeQuestionType,
): Promise<PracticeAnsweringState> {
  const firstReview = await finishCurrentAttempt(await generateQuestion(questionType))
  const generating = await settle(
    continueToNextPracticeQuestion({
      sessionId: firstReview.sessionId,
      version: firstReview.version,
      questionId: firstReview.question.id,
    }),
  )
  if (generating.session.status !== "generatingQuestion") throw new Error("Expected generation.")
  const input = { sessionId: generating.session.sessionId, version: generating.session.version }
  await settle(getQuestionGenerationStatus(input))
  const next = await settle(getQuestionGenerationStatus(input))
  if (next.session.status !== "answering") throw new Error("Expected second question.")
  return next.session
}

async function revealReferenceAnswer(session: PracticeAnsweringState) {
  const response = await settle(
    requestPracticeReferenceAnswer({
      sessionId: session.sessionId,
      version: session.version,
      questionId: session.question.id,
    }),
  )
  if (response.session.status !== "answering") throw new Error("Expected answering session.")
  if (response.session.question.referenceAnswer.status !== "revealed") {
    throw new Error("Expected revealed reference answer.")
  }
  return response.session
}

function getRevealedReferenceAnswer(session: PracticeAnsweringState): PracticeReferenceAnswer {
  if (session.question.referenceAnswer.status !== "revealed") {
    throw new Error("Expected revealed reference answer.")
  }
  return session.question.referenceAnswer.content
}

async function setCurrentQuestionFlags(
  initial: PracticeAnsweringState,
  flags: { isSaved: boolean; isMarkedWeak: boolean },
): Promise<PracticeAnsweringState> {
  let session = initial

  if (session.question.isSaved !== flags.isSaved) {
    const response = await settle(
      setQuestionSaved({
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.question.id,
        isSaved: flags.isSaved,
      }),
    )
    if (response.session.status !== "answering") {
      throw new Error("Saving a current question must preserve the answering session.")
    }
    session = response.session
  }

  if (session.question.isMarkedWeak !== flags.isMarkedWeak) {
    const response = await settle(
      setQuestionWeak({
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.question.id,
        isMarkedWeak: flags.isMarkedWeak,
      }),
    )
    if (response.session.status !== "answering") {
      throw new Error("Marking a current question weak must preserve the answering session.")
    }
    session = response.session
  }

  return session
}

async function completeRetriedQuestionWithFinalFlags(
  firstFlags: { isSaved: boolean; isMarkedWeak: boolean },
  secondFlags: { isSaved: boolean; isMarkedWeak: boolean },
) {
  const firstAnswering = await setCurrentQuestionFlags(
    await generateQuestion("motivation"),
    firstFlags,
  )
  const firstReview = await finishCurrentAttempt(firstAnswering)
  const retried = await settle(
    retryCurrentPracticeQuestion({
      sessionId: firstReview.sessionId,
      version: firstReview.version,
      questionId: firstReview.question.id,
    }),
  )
  if (retried.session.status !== "answering") {
    throw new Error("Retrying a reviewed question must return an answering session.")
  }
  const secondAnswering = await setCurrentQuestionFlags(retried.session, secondFlags)
  const secondReview = await finishCurrentAttempt(secondAnswering)
  const completed = await settle(
    endPracticeSession({ sessionId: secondReview.sessionId, version: secondReview.version }),
  )
  if (completed.session.status !== "completed") {
    throw new Error("Finishing the retried question must complete the session.")
  }

  return { completed: completed.session, firstReview, retried: retried.session, secondReview }
}

describe("practice stateful mock service", () => {
  it("matches both technical questions to different template-specific answers", async () => {
    const first = await revealReferenceAnswer(await generateQuestion("technicalFoundation"))
    const firstReference = getRevealedReferenceAnswer(first)
    expect(first.question.templateId).toBe("technicalFoundation.reactRepeatedRendering")
    expect(firstReference.answer).toMatch(/React|Profiler/)

    resetPracticeMockState()
    const second = await revealReferenceAnswer(
      await continueToSecondQuestion("technicalFoundation"),
    )
    const secondReference = getRevealedReferenceAnswer(second)
    expect(second.question.templateId).toBe("technicalFoundation.requestLayerDesign")
    expect(secondReference.answer).toMatch(/类型安全/)
    expect(secondReference.answer).toMatch(/缓存 key|缓存一致性/)
    expect(secondReference.answer).toMatch(/错误边界|错误分类/)
    expect(secondReference.answer).not.toBe(firstReference.answer)
    expect(secondReference.answer).not.toMatch(/^React 重复渲染/)
  })

  it.each([
    ["projectDeepDive", "projectDeepDive.complexProjectTradeoff", /备选方案|技术取舍/],
    ["behavioral", "behavioral.incidentUnderPressure", /高压期限|优先级/],
    [
      "businessUnderstanding",
      "businessUnderstanding.experienceVsRevenueTradeoff",
      /用户体验|短期业务收益/,
    ],
    ["motivation", "motivation.careerDirection", /职业方向|长期规划/],
  ] as const)(
    "matches the second %s question to its own reference",
    async (questionType, id, pattern) => {
      const first = await revealReferenceAnswer(await generateQuestion(questionType))
      const firstReference = getRevealedReferenceAnswer(first)
      resetPracticeMockState()
      const second = await revealReferenceAnswer(await continueToSecondQuestion(questionType))
      const secondReference = getRevealedReferenceAnswer(second)
      expect(second.question.templateId).toBe(id)
      expect(secondReference.answer).toMatch(pattern)
      expect(secondReference.answer).not.toBe(firstReference.answer)
    },
  )

  it("reveals a versioned reference answer without leaving answering", async () => {
    const initial = await generateQuestion("projectDeepDive")
    const input = {
      sessionId: initial.sessionId,
      version: initial.version,
      questionId: initial.question.id,
    }
    const response = await settle(requestPracticeReferenceAnswer(input))
    expect(response.session).toMatchObject({
      status: "answering",
      sessionId: initial.sessionId,
      version: initial.version + 1,
      question: { referenceAnswer: { status: "revealed", viewedBeforeSubmission: true } },
    })
    if (response.session.status !== "answering") return
    expect(response.session.question.referenceAnswer.content).not.toBeNull()
    const staleRequest = requestPracticeReferenceAnswer(input)
    const staleExpectation = expect(staleRequest).rejects.toThrow()
    await vi.runAllTimersAsync()
    await staleExpectation
  })

  it("rejects an unknown question when requesting a reference answer", async () => {
    const initial = await generateQuestion("behavioral")
    const invalidRequest = requestPracticeReferenceAnswer({
      sessionId: initial.sessionId,
      version: initial.version,
      questionId: "unknown-question",
    })
    const invalidExpectation = expect(invalidRequest).rejects.toThrow()
    await vi.runAllTimersAsync()
    await invalidExpectation
  })

  it("adds an unassisted reference answer to review when it was not requested", async () => {
    const review = await completeQuestionToReview("technicalFoundation")
    expect(review.question.referenceAnswer).toMatchObject({
      status: "revealed",
      viewedBeforeSubmission: false,
      content: { kind: "technicalReference" },
    })
  })

  it("preserves the same reference answer for retry and resets it for the next question", async () => {
    const initial = await generateQuestion("projectDeepDive")
    const revealedResponse = await settle(
      requestPracticeReferenceAnswer({
        sessionId: initial.sessionId,
        version: initial.version,
        questionId: initial.question.id,
      }),
    )
    if (revealedResponse.session.status !== "answering") throw new Error("Expected answering.")
    const review = await finishCurrentAttempt(revealedResponse.session)
    const original = review.question.referenceAnswer
    const retried = await settle(
      retryCurrentPracticeQuestion({
        sessionId: review.sessionId,
        version: review.version,
        questionId: review.question.id,
      }),
    )
    if (retried.session.status !== "answering") throw new Error("Expected retry answering.")
    expect(isCurrentPracticeAttemptRetry(retried.session)).toBe(true)
    expect(retried.session.question.templateId).toBe(review.question.templateId)
    expect(retried.session.question.referenceAnswer).toEqual({
      ...original,
      viewedBeforeSubmission: true,
    })
    expect(retried.session.attemptRecords[0]?.question.templateId).toBe(review.question.templateId)
    expect(retried.session.attemptRecords[0]?.question.referenceAnswer).toEqual(original)

    resetPracticeMockState()
    const nextReview = await completeQuestionToReview("motivation")
    const generating = await settle(
      continueToNextPracticeQuestion({
        sessionId: nextReview.sessionId,
        version: nextReview.version,
        questionId: nextReview.question.id,
      }),
    )
    if (generating.session.status !== "generatingQuestion") throw new Error("Expected generating.")
    const generationInput = {
      sessionId: generating.session.sessionId,
      version: generating.session.version,
    }
    await settle(getQuestionGenerationStatus(generationInput))
    const next = await settle(getQuestionGenerationStatus(generationInput))
    if (next.session.status !== "answering") throw new Error("Expected next question.")
    expect(isCurrentPracticeAttemptRetry(next.session)).toBe(false)
    expect(next.session.question.referenceAnswer).toEqual({
      status: "notRequested",
      content: null,
      viewedBeforeSubmission: false,
    })
  })

  it("counts saved and weak status once when both retries end enabled", async () => {
    const { completed, firstReview, retried, secondReview } =
      await completeRetriedQuestionWithFinalFlags(
        { isSaved: true, isMarkedWeak: true },
        { isSaved: true, isMarkedWeak: true },
      )

    expect(retried.sessionId).toBe(firstReview.sessionId)
    expect(secondReview.sessionId).toBe(firstReview.sessionId)
    expect(retried.question.id).toBe(firstReview.question.id)
    expect(secondReview.question.id).toBe(firstReview.question.id)
    expect(retried.attemptId).not.toBe(firstReview.attemptId)
    expect(secondReview.attemptId).toBe(retried.attemptId)
    expect(completed).toMatchObject({
      questionsCompleted: 1,
      retryCount: 1,
      savedQuestionCount: 1,
      newWeaknessCount: 1,
    })
    expect(completed.attemptRecords).toHaveLength(2)
    expect(completed.attemptRecords.map((record) => record.isSaved)).toEqual([true, true])
    expect(completed.attemptRecords.map((record) => record.isMarkedWeak)).toEqual([true, true])
  })

  it("uses the final retried attempt when saved and weak status are cancelled", async () => {
    const { completed, firstReview, retried, secondReview } =
      await completeRetriedQuestionWithFinalFlags(
        { isSaved: true, isMarkedWeak: true },
        { isSaved: false, isMarkedWeak: false },
      )

    expect(retried.sessionId).toBe(firstReview.sessionId)
    expect(secondReview.question.id).toBe(firstReview.question.id)
    expect(retried.attemptId).not.toBe(firstReview.attemptId)
    expect(completed).toMatchObject({
      questionsCompleted: 1,
      retryCount: 1,
      savedQuestionCount: 0,
      newWeaknessCount: 0,
    })
    expect(completed.attemptRecords.map((record) => record.isSaved)).toEqual([true, false])
    expect(completed.attemptRecords.map((record) => record.isMarkedWeak)).toEqual([true, false])
  })

  it("uses the final retried attempt when saved and weak status are newly enabled", async () => {
    const { completed, firstReview, retried, secondReview } =
      await completeRetriedQuestionWithFinalFlags(
        { isSaved: false, isMarkedWeak: false },
        { isSaved: true, isMarkedWeak: true },
      )

    expect(retried.sessionId).toBe(firstReview.sessionId)
    expect(secondReview.question.id).toBe(firstReview.question.id)
    expect(retried.attemptId).not.toBe(firstReview.attemptId)
    expect(completed).toMatchObject({
      questionsCompleted: 1,
      retryCount: 1,
      savedQuestionCount: 1,
      newWeaknessCount: 1,
    })
    expect(completed.attemptRecords.map((record) => record.isSaved)).toEqual([false, true])
    expect(completed.attemptRecords.map((record) => record.isMarkedWeak)).toEqual([false, true])
  })

  it("retries one question within the same session and archives both scored attempts", async () => {
    const firstReview = await finishCurrentAttempt(await generateQuestion("behavioral"))
    const retried = await settle(
      retryCurrentPracticeQuestion({
        sessionId: firstReview.sessionId,
        version: firstReview.version,
        questionId: firstReview.question.id,
      }),
    )
    if (retried.session.status !== "answering") throw new Error("Expected retry answering state.")
    expect(retried.session.sessionId).toBe(firstReview.sessionId)
    expect(retried.session.question.id).toBe(firstReview.question.id)
    expect(retried.session.attemptNumber).toBe(2)
    expect(retried.session.attemptId).not.toBe(firstReview.attemptId)
    expect(retried.session.attemptRecords).toHaveLength(1)
    const staleRetry = retryCurrentPracticeQuestion({
      sessionId: firstReview.sessionId,
      version: firstReview.version,
      questionId: firstReview.question.id,
    })
    const staleRetryAssertion = expect(staleRetry).rejects.toThrow()
    await vi.runAllTimersAsync()
    await staleRetryAssertion

    const secondReview = await finishCurrentAttempt(retried.session)
    const completed = await settle(
      endPracticeSession({ sessionId: secondReview.sessionId, version: secondReview.version }),
    )
    if (completed.session.status !== "completed") throw new Error("Expected completed session.")
    expect(completed.session.attemptRecords).toHaveLength(2)
    expect(completed.session.questionsCompleted).toBe(1)
    expect(completed.session.retryCount).toBe(1)
    expect(completed.session.averageScore).toBe(
      Math.round(
        completed.session.attemptRecords.reduce(
          (sum, record) => sum + record.evaluation.overallScore,
          0,
        ) / 2,
      ),
    )
    expect("question" in completed.session).toBe(false)
    expect("review" in completed.session).toBe(false)
  })

  it("continues to a distinct recommended question within the same session", async () => {
    const firstReview = await finishCurrentAttempt(await generateQuestion("motivation"))
    if (firstReview.review.recommendation.action !== "nextQuestion") {
      throw new Error("Expected the completed motivation attempt to recommend the next question.")
    }
    const generating = await settle(
      continueToNextPracticeQuestion({
        sessionId: firstReview.sessionId,
        version: firstReview.version,
        questionId: firstReview.question.id,
      }),
    )
    if (generating.session.status !== "generatingQuestion") throw new Error("Expected generation.")
    const input = { sessionId: generating.session.sessionId, version: generating.session.version }
    await settle(getQuestionGenerationStatus(input))
    const next = await settle(getQuestionGenerationStatus(input))
    if (next.session.status !== "answering") throw new Error("Expected next answering state.")
    expect(next.session.sessionId).toBe(firstReview.sessionId)
    expect(next.session.attemptNumber).toBe(2)
    expect(next.session.attemptRecords).toHaveLength(1)
    expect(next.session.question.id).not.toBe(firstReview.question.id)
    expect(next.session.question.prompt).not.toBe(firstReview.question.prompt)
    expect(next.session.question.questionType).toBe(
      firstReview.review.recommendation.nextQuestion.questionType,
    )
    expect(next.session.question.difficulty).toBe(
      firstReview.review.recommendation.nextQuestion.difficulty,
    )
  })

  it("keeps completed history when ending before the generated next question is answered", async () => {
    const firstReview = await finishCurrentAttempt(await generateQuestion("motivation"))
    const generating = await settle(
      continueToNextPracticeQuestion({
        sessionId: firstReview.sessionId,
        version: firstReview.version,
        questionId: firstReview.question.id,
      }),
    )
    if (generating.session.status !== "generatingQuestion") throw new Error("Expected generation.")
    const input = { sessionId: generating.session.sessionId, version: generating.session.version }
    await settle(getQuestionGenerationStatus(input))
    const next = await settle(getQuestionGenerationStatus(input))
    if (next.session.status !== "answering") throw new Error("Expected answering next question.")
    const completed = await settle(
      requestEndPracticeSession({
        sessionId: next.session.sessionId,
        version: next.session.version,
        questionId: next.session.question.id,
      }),
    )
    if (completed.session.status !== "completed") throw new Error("Expected completed session.")
    expect(completed.session.attemptRecords).toHaveLength(1)
    expect(completed.session.questionsCompleted).toBe(1)
    expect(completed.session.retryCount).toBe(0)
    expect(completed.session.averageScore).toBe(firstReview.evaluation.overallScore)
    expect("question" in completed.session).toBe(false)
    expect("mainAnswer" in completed.session).toBe(false)
    expect("review" in completed.session).toBe(false)
  })
  it("preserves a reviewed attempt when retrying and completes a session with records", async () => {
    const review = await completeQuestionToReview("behavioral")
    const retried = await settle(
      retryCurrentPracticeQuestion({
        sessionId: review.sessionId,
        version: review.version,
        questionId: review.question.id,
      }),
    )
    expect(retried.session.status).toBe("answering")
    if (retried.session.status !== "answering") return
    expect(retried.session.attemptId).not.toBe(review.attemptId)
    expect(retried.session.attemptRecords).toHaveLength(1)
    expect(retried.session.attemptRecords[0]?.attemptId).toBe(review.attemptId)

    const nextReview = await completeQuestionToReview("motivation")
    const completed = await settle(
      endPracticeSession({ sessionId: nextReview.sessionId, version: nextReview.version }),
    )
    expect(completed.session.status).toBe("completed")
    if (completed.session.status !== "completed") return
    expect(completed.session.attemptRecords).toHaveLength(1)
    expect(completed.session.averageScore).toBeGreaterThan(0)
  })

  it("moves a reviewed attempt into deterministic next-question generation", async () => {
    const review = await completeQuestionToReview("motivation")
    const generating = await settle(
      continueToNextPracticeQuestion({
        sessionId: review.sessionId,
        version: review.version,
        questionId: review.question.id,
      }),
    )
    expect(generating.session).toMatchObject({
      status: "generatingQuestion",
      sessionId: review.sessionId,
    })
    if (generating.session.status !== "generatingQuestion") return
    expect(generating.session.previousAttempt?.attemptId).toBe(review.attemptId)
  })
  it("projects current target-role data from the roles mock service", async () => {
    const response = await settle(getPracticePage())

    expect(response.setupContext.defaultTargetRoleId).toBe("role_frontend_bytedance")
    expect(response.setupContext.targetRoles).toHaveLength(2)
    expect(response.setupContext.targetRoles[1]).toMatchObject({
      id: "role_product_manager_meituan",
      title: "Product Manager",
      company: "Meituan",
    })
  })

  it("keeps an existing practice role after the current role changes", async () => {
    resetPracticeMockState("noEligibleHistoryQuestions")
    const before = await settle(getPracticePage())
    const roles = await settle(getRolesPage())
    const productManager = roles.roles.find((role) => role.id === "role_product_manager_meituan")
    if (!productManager) throw new Error("Expected the Product Manager role fixture.")

    await settle(
      setCurrentTargetRole({ roleId: productManager.id, version: productManager.version }),
    )
    const response = await settle(getPracticePage())
    if (response.session.status !== "setup" || before.session.status !== "setup") return

    expect(response.setupContext.defaultTargetRoleId).toBe(productManager.id)
    expect(response.session.selection.targetRoleId).toBe(before.session.selection.targetRoleId)
    expect(
      response.setupContext.targetRoles
        .find((role) => role.id === response.session.selection.targetRoleId)
        ?.supportedQuestionTypes.includes(response.session.selection.questionType),
    ).toBe(true)
    expect(response.session.selection).toMatchObject({
      difficulty: before.session.selection.difficulty,
      source: before.session.selection.source,
      prioritizeWeaknesses: before.session.selection.prioritizeWeaknesses,
    })
  })

  it("falls back to an existing selected role when no current role exists", async () => {
    resetRolesMockState("rolesWithoutCurrent")

    const response = await settle(getPracticePage())
    if (response.session.status !== "setup") return

    expect(response.setupContext.defaultTargetRoleId).toBeNull()
    expect(response.session.selection.targetRoleId).toBe("role_frontend_bytedance")
    expect(
      response.setupContext.targetRoles.some(
        (role) => role.id === response.session.selection.targetRoleId,
      ),
    ).toBe(true)
  })

  it("only corrects the question type when the existing role no longer supports it", () => {
    const fixture = createPracticeMockResponse("setupReady")
    if (fixture.session.status !== "setup") return
    const productManager = fixture.setupContext.targetRoles.find(
      (role) => role.id === "role_product_manager_meituan",
    )
    if (!productManager) throw new Error("Expected the Product Manager role fixture.")

    const selection = reconcilePracticeSetupSelection(fixture.setupContext, {
      ...fixture.session.selection,
      targetRoleId: productManager.id,
      questionType: "technicalFoundation",
      difficulty: "pressure",
      source: "saved",
      prioritizeWeaknesses: true,
    })

    expect(selection).toEqual({
      targetRoleId: productManager.id,
      questionType: productManager.supportedQuestionTypes[0],
      difficulty: "pressure",
      source: "saved",
      prioritizeWeaknesses: true,
    })
  })

  it("does not grant technical questions to roles without practice metadata", async () => {
    const roles = await settle(
      createTargetRole({
        title: "HR Business Partner",
        company: "Riva",
        recruitmentType: null,
        location: null,
        experienceRange: null,
        preparationStatus: "preparing",
      }),
    )
    const createdRole = roles.roles.find((role) => role.title === "HR Business Partner")
    if (!createdRole) throw new Error("Expected the newly created role.")

    const response = await settle(getPracticePage())
    const practiceRole = response.setupContext.targetRoles.find(
      (role) => role.id === createdRole.id,
    )

    expect(practiceRole?.supportedQuestionTypes).toEqual([
      "projectDeepDive",
      "behavioral",
      "businessUnderstanding",
      "motivation",
    ])
    expect(practiceRole?.supportedQuestionTypes).not.toContain("technicalFoundation")
    expect(new Set(practiceRole?.supportedQuestionTypes).size).toBe(
      practiceRole?.supportedQuestionTypes.length,
    )
  })

  it("moves from setup through generation to an answering snapshot", async () => {
    const setup = await settle(getPracticePage())
    if (setup.session.selection.targetRoleId === null) {
      throw new Error("The default practice setup must select a target role.")
    }

    const generating = await settle(
      startPracticeSession({
        ...setup.session.selection,
        targetRoleId: setup.session.selection.targetRoleId,
      }),
    )
    expect(generating.session).toMatchObject({ status: "generatingQuestion", version: 1 })
    if (generating.session.status !== "generatingQuestion") return

    const pollInput = {
      sessionId: generating.session.sessionId,
      version: generating.session.version,
    }
    const stillGenerating = await settle(getQuestionGenerationStatus(pollInput))
    const answering = await settle(getQuestionGenerationStatus(pollInput))

    expect(stillGenerating.session.status).toBe("generatingQuestion")
    expect(answering.session).toMatchObject({
      status: "answering",
      sessionId: generating.session.sessionId,
      version: 2,
    })
  })

  it("generates a question that matches the selected type and difficulty", async () => {
    const setup = await settle(getPracticePage())
    const roleId = setup.setupContext.defaultTargetRoleId
    if (!roleId) throw new Error("The default practice setup must include a current role.")

    const generating = await settle(
      startPracticeSession({
        ...setup.session.selection,
        targetRoleId: roleId,
        questionType: "behavioral",
        difficulty: "pressure",
      }),
    )
    if (generating.session.status !== "generatingQuestion") return
    const input = {
      sessionId: generating.session.sessionId,
      version: generating.session.version,
    }

    await settle(getQuestionGenerationStatus(input))
    const answering = await settle(getQuestionGenerationStatus(input))

    expect(answering.session.status).toBe("answering")
    if (answering.session.status !== "answering") return
    expect(answering.session.question).toMatchObject({
      questionType: "behavioral",
      difficulty: "pressure",
      answerHints: { status: "notRequested", content: null },
      answerFramework: { status: "notRequested", content: null },
    })
  })

  it("keeps saved-source generated questions saved", async () => {
    const setup = await settle(getPracticePage())
    const roleId = setup.setupContext.defaultTargetRoleId
    if (!roleId) throw new Error("The default practice setup must include a current role.")

    const generating = await settle(
      startPracticeSession({
        ...setup.session.selection,
        targetRoleId: roleId,
        source: "saved",
      }),
    )
    if (generating.session.status !== "generatingQuestion") return
    const input = {
      sessionId: generating.session.sessionId,
      version: generating.session.version,
    }

    await settle(getQuestionGenerationStatus(input))
    const answering = await settle(getQuestionGenerationStatus(input))

    expect(answering.session.status).toBe("answering")
    if (answering.session.status !== "answering") return
    expect(answering.session.question.isSaved).toBe(true)
    expect(answering.session.question.isMarkedWeak).toBe(false)
  })

  it("generates a distinct next question after skipping", async () => {
    const setup = await settle(getPracticePage())
    const roleId = setup.setupContext.defaultTargetRoleId
    if (!roleId) throw new Error("The default practice setup must include a current role.")
    const generating = await settle(
      startPracticeSession({ ...setup.session.selection, targetRoleId: roleId }),
    )
    if (generating.session.status !== "generatingQuestion") return
    const firstPollInput = {
      sessionId: generating.session.sessionId,
      version: generating.session.version,
    }
    await settle(getQuestionGenerationStatus(firstPollInput))
    const first = await settle(getQuestionGenerationStatus(firstPollInput))
    if (first.session.status !== "answering") return

    const skipped = await settle(
      skipPracticeQuestion({
        sessionId: first.session.sessionId,
        version: first.session.version,
        questionId: first.session.question.id,
      }),
    )
    if (skipped.session.status !== "generatingQuestion") return
    const secondPollInput = {
      sessionId: skipped.session.sessionId,
      version: skipped.session.version,
    }
    await settle(getQuestionGenerationStatus(secondPollInput))
    const second = await settle(getQuestionGenerationStatus(secondPollInput))
    if (second.session.status !== "answering") return

    expect(second.session.sessionId).toBe(first.session.sessionId)
    expect(skipped.session.version).toBe(first.session.version + 1)
    expect(second.session.version).toBe(skipped.session.version + 1)
    expect(second.session.question.id).not.toBe(first.session.question.id)
    expect(second.session.question.prompt).not.toBe(first.session.question.prompt)
  })

  it("rejects stale polling without overwriting a newer session", async () => {
    const setup = await settle(getPracticePage())
    const roleId = setup.setupContext.defaultTargetRoleId
    if (!roleId) throw new Error("The default practice setup must include a current role.")

    const first = await settle(
      startPracticeSession({ ...setup.session.selection, targetRoleId: roleId }),
    )
    if (first.session.status !== "generatingQuestion") return

    const second = await settle(
      startPracticeSession({ ...first.session.selection, difficulty: "pressure" }),
    )
    const stalePoll = getQuestionGenerationStatus({
      sessionId: first.session.sessionId,
      version: first.session.version,
    })
    const staleAssertion = expect(stalePoll).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await staleAssertion

    const current = await settle(getPracticePage())
    expect(current.session).toEqual(second.session)
  })

  it("does not rewrite an active session after the current role changes", async () => {
    const setup = await settle(getPracticePage())
    const frontendRoleId = setup.setupContext.defaultTargetRoleId
    if (!frontendRoleId) throw new Error("Expected the Frontend role to be current.")

    const active = await settle(
      startPracticeSession({
        ...setup.session.selection,
        targetRoleId: frontendRoleId,
        questionType: "technicalFoundation",
      }),
    )
    if (active.session.status !== "generatingQuestion") return

    const roles = await settle(getRolesPage())
    const productManager = roles.roles.find((role) => role.id === "role_product_manager_meituan")
    if (!productManager) throw new Error("Expected the Product Manager role fixture.")
    await settle(
      setCurrentTargetRole({ roleId: productManager.id, version: productManager.version }),
    )

    const response = await settle(getPracticePage())
    expect(response.setupContext.defaultTargetRoleId).toBe(productManager.id)
    expect(response.session).toEqual(active.session)
    expect(response.session.selection).toMatchObject({
      targetRoleId: frontendRoleId,
      questionType: "technicalFoundation",
    })
  })

  it("reveals guidance once and persists saved and weak states", async () => {
    resetPracticeMockState("answeringQuestion")
    const initial = await settle(getPracticePage())
    if (initial.session.status !== "answering") return
    const questionInput = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
    }

    const hinted = await settle(requestPracticeHint(questionInput))
    if (hinted.session.status !== "answering") return
    expect(hinted.session.question.answerHints.status).toBe("revealed")
    expect(hinted.session.question.answerHints.content).not.toHaveLength(0)

    const duplicateHint = await settle(
      requestPracticeHint({ ...questionInput, version: hinted.session.version }),
    )
    if (duplicateHint.session.status !== "answering") return
    expect(duplicateHint.session.version).toBe(hinted.session.version)

    const framed = await settle(
      requestAnswerFramework({ ...questionInput, version: hinted.session.version }),
    )
    if (framed.session.status !== "answering") return
    expect(framed.session.question.answerFramework.status).toBe("revealed")

    const saved = await settle(
      setQuestionSaved({ ...questionInput, version: framed.session.version, isSaved: true }),
    )
    if (saved.session.status !== "answering") return
    const weak = await settle(
      setQuestionWeak({
        ...questionInput,
        version: saved.session.version,
        isMarkedWeak: true,
      }),
    )
    if (weak.session.status !== "answering") return

    expect(saved.session.question.isSaved).toBe(true)
    expect(weak.session.question).toMatchObject({ isSaved: true, isMarkedWeak: true })
    expect(weak.session.version).toBe(initial.session.version + 4)
  })

  it("reveals behavioral hints without project-performance guidance", async () => {
    const initial = await generateQuestion("behavioral")
    const hinted = await settle(
      requestPracticeHint({
        sessionId: initial.sessionId,
        version: initial.version,
        questionId: initial.question.id,
      }),
    )
    if (hinted.session.status !== "answering") return

    expect(hinted.session.question.id).toBe(initial.question.id)
    expect(hinted.session.version).toBe(initial.version + 1)
    expect(hinted.session.question.answerHints.content?.join(" ")).toMatch(
      /情境|冲突|挑战|行动|协作|复盘/,
    )
    expect(hinted.session.question.answerHints.content?.join(" ")).not.toContain("性能问题")
  })

  it("reveals a motivation-specific answer framework", async () => {
    const initial = await generateQuestion("motivation")
    const framed = await settle(
      requestAnswerFramework({
        sessionId: initial.sessionId,
        version: initial.version,
        questionId: initial.question.id,
      }),
    )
    if (framed.session.status !== "answering") return

    expect(framed.session.question.id).toBe(initial.question.id)
    expect(framed.session.version).toBe(initial.version + 1)
    expect(framed.session.question.answerFramework.content?.join(" ")).toMatch(
      /岗位|经历|价值|职业/,
    )
  })

  it("reveals technical hints and framework with principles, tradeoffs, and validation", async () => {
    const initial = await generateQuestion("technicalFoundation")
    const input = {
      sessionId: initial.sessionId,
      version: initial.version,
      questionId: initial.question.id,
    }
    const hinted = await settle(requestPracticeHint(input))
    if (hinted.session.status !== "answering") return
    const framed = await settle(
      requestAnswerFramework({ ...input, version: hinted.session.version }),
    )
    if (framed.session.status !== "answering") return

    expect(framed.session.question.id).toBe(initial.question.id)
    expect(framed.session.version).toBe(initial.version + 2)
    const technicalContent = [
      ...(framed.session.question.answerHints.content ?? []),
      ...(framed.session.question.answerFramework.content ?? []),
    ].join(" ")
    for (const concept of ["原理", "方案", "权衡", "验证"]) {
      expect(technicalContent).toContain(concept)
    }
    expect(JSON.stringify(framed.session.question)).not.toMatch(
      /参考答案|完整评分标准|内部追问策略/,
    )
  })

  it("submits a trimmed main answer once and enters a stable follow-up", async () => {
    resetPracticeMockState("answeringQuestion")
    const initial = await settle(getPracticePage())
    if (initial.session.status !== "answering") return

    const response = await settle(
      submitPrimaryAnswer({
        sessionId: initial.session.sessionId,
        version: initial.session.version,
        questionId: initial.session.question.id,
        content: "  我通过性能数据定位瓶颈，并推动拆包方案落地。  ",
      }),
    )

    expect(response.session.status).toBe("answeringFollowUp")
    if (response.session.status !== "answeringFollowUp") return
    expect(response.session.mainAnswer).toMatchObject({
      content: "我通过性能数据定位瓶颈，并推动拆包方案落地。",
      order: 1,
    })
    expect(response.session.followUpExchanges).toEqual([])
    expect(response.session.currentFollowUp.question).toMatchObject({
      id: `${initial.session.question.id}_follow_up_1`,
      order: 1,
      prompt: getPracticeFollowUpPlan(initial.session.question.templateId)[0]?.prompt,
    })
    expect(response.session.version).toBe(initial.session.version + 1)

    const duplicate = submitPrimaryAnswer({
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
      content: "重复提交",
    })
    const assertion = expect(duplicate).rejects.toThrow("out of date")
    await vi.runAllTimersAsync()
    await assertion
  })

  it("enters evaluating directly when the stable question plan needs no follow-up", async () => {
    const initial = await generateQuestion("motivation")

    const response = await settle(
      submitPrimaryAnswer({
        sessionId: initial.sessionId,
        version: initial.version,
        questionId: initial.question.id,
        content: "这个岗位连接了我的产品经历和下一阶段发展目标。",
      }),
    )

    expect(response.session.status).toBe("evaluating")
    if (response.session.status !== "evaluating") return
    expect(response.session.followUpExchanges).toEqual([])
    expect(response.session.followUpCompletion).toEqual({
      status: "completed",
      reason: "noFollowUpRequired",
    })
  })

  it("reveals versioned assistance only on the current concrete follow-up", async () => {
    resetPracticeMockState("answeringFirstFollowUp")
    const initial = await settle(getPracticePage())
    if (initial.session.status !== "answeringFollowUp") return
    const baseInput = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
      followUpQuestionId: initial.session.currentFollowUp.question.id,
    }

    const hinted = await settle(requestPracticeFollowUpHint(baseInput))
    if (hinted.session.status !== "answeringFollowUp") return
    expect(hinted.session.version).toBe(initial.session.version + 1)
    expect(hinted.session.mainAnswer).toEqual(initial.session.mainAnswer)
    expect(hinted.session.followUpExchanges).toEqual(initial.session.followUpExchanges)
    expect(hinted.session.currentFollowUp.question.answerHints.status).toBe("revealed")
    expect(hinted.session.currentFollowUp.question.answerFramework.status).toBe("notRequested")
    expect(hinted.session.currentFollowUp.question.referenceAnswer.status).toBe("notRequested")

    const frameworkInput = { ...baseInput, version: hinted.session.version }
    const framed = await settle(requestPracticeFollowUpFramework(frameworkInput))
    if (framed.session.status !== "answeringFollowUp") return
    expect(framed.session.version).toBe(hinted.session.version + 1)
    expect(framed.session.currentFollowUp.question.answerFramework.status).toBe("revealed")

    const referenceInput = { ...baseInput, version: framed.session.version }
    const referenced = await settle(requestPracticeFollowUpReferenceAnswer(referenceInput))
    if (referenced.session.status !== "answeringFollowUp") return
    const reference = referenced.session.currentFollowUp.question.referenceAnswer
    expect(referenced.session.version).toBe(framed.session.version + 1)
    expect(reference.status).toBe("revealed")
    if (reference.status !== "revealed") return
    expect(reference.viewedBeforeSubmission).toBe(true)
    expect(reference.content.answer).toContain(referenced.session.currentFollowUp.question.prompt)
    expect(reference.content.answer).toContain(referenced.session.question.prompt)
    expect(reference.content.answer).toContain("Senior Frontend Engineer")

    const repeated = await settle(
      requestPracticeFollowUpReferenceAnswer({
        ...referenceInput,
        version: referenced.session.version,
      }),
    )
    expect(repeated).toEqual(referenced)

    for (const invalid of [
      { ...baseInput, version: initial.session.version },
      { ...baseInput, version: referenced.session.version, questionId: "wrong-question" },
      {
        ...baseInput,
        version: referenced.session.version,
        followUpQuestionId: "wrong-follow-up",
      },
    ]) {
      const request = requestPracticeFollowUpHint(invalid)
      const assertion = expect(request).rejects.toThrow("out of date")
      await vi.runAllTimersAsync()
      await assertion
    }

    const submitted = await settle(
      submitFollowUpAnswer({
        ...baseInput,
        version: referenced.session.version,
        content: "我补充真实的对照证据和归因边界。",
      }),
    )
    if (submitted.session.status !== "answeringFollowUp") return
    expect(submitted.session.followUpExchanges[0]?.question).toEqual(
      referenced.session.currentFollowUp.question,
    )
    expect(submitted.session.currentFollowUp.question.answerHints.status).toBe("notRequested")
    expect(submitted.session.currentFollowUp.question.answerFramework.status).toBe("notRequested")
    expect(submitted.session.currentFollowUp.question.referenceAnswer.status).toBe("notRequested")
  })

  it("binds one behavioral follow-up answer to the current question and completes", async () => {
    const initial = await generateQuestion("behavioral")
    const following = await settle(
      submitPrimaryAnswer({
        sessionId: initial.sessionId,
        version: initial.version,
        questionId: initial.question.id,
        content: "我先对齐共同目标，再用事实拆解分歧并推动小范围验证。",
      }),
    )
    if (following.session.status !== "answeringFollowUp") {
      throw new Error("Behavioral practice must have one follow-up.")
    }
    const current = following.session.currentFollowUp.question

    const completed = await settle(
      submitFollowUpAnswer({
        sessionId: following.session.sessionId,
        version: following.session.version,
        questionId: following.session.question.id,
        followUpQuestionId: current.id,
        content: "  我会更早确认对方的约束，并把验证标准写清楚。  ",
      }),
    )

    expect(completed.session.status).toBe("evaluating")
    if (completed.session.status !== "evaluating") return
    expect(completed.session.followUpExchanges).toHaveLength(1)
    expect(completed.session.followUpExchanges[0]).toMatchObject({
      question: { id: current.id, order: 1 },
      answer: {
        content: "我会更早确认对方的约束，并把验证标准写清楚。",
        order: 2,
      },
    })
    expect(completed.session.followUpCompletion).toEqual({
      status: "completed",
      reason: "allAnswered",
    })
  })

  it("keeps multiple follow-ups ordered and rejects a stale previous-follow-up operation", async () => {
    const initial = await generateQuestion("projectDeepDive")
    const first = await settle(
      submitPrimaryAnswer({
        sessionId: initial.sessionId,
        version: initial.version,
        questionId: initial.question.id,
        content: "我定位关键瓶颈、推动方案落地并用实验验证结果。",
      }),
    )
    if (first.session.status !== "answeringFollowUp") {
      throw new Error("Project practice must have follow-ups.")
    }
    const firstInput = {
      sessionId: first.session.sessionId,
      version: first.session.version,
      questionId: first.session.question.id,
      followUpQuestionId: first.session.currentFollowUp.question.id,
      content: "我使用分层灰度和对照数据验证归因。",
    }
    const second = await settle(submitFollowUpAnswer(firstInput))
    if (second.session.status !== "answeringFollowUp") {
      throw new Error("Project practice must continue to a second follow-up.")
    }

    expect(second.session.followUpExchanges.map(({ question }) => question.order)).toEqual([1])
    expect(second.session.currentFollowUp.question.order).toBe(2)
    expect(second.session.currentFollowUp.question.prompt).toBe(
      getPracticeFollowUpPlan(second.session.question.templateId)[1]?.prompt,
    )
    expect(second.session.currentFollowUp.question.id).not.toBe(firstInput.followUpQuestionId)
    expect(second.session.version).toBe(first.session.version + 1)

    const stale = submitFollowUpAnswer(firstInput)
    const staleAssertion = expect(stale).rejects.toThrow("out of date")
    await vi.runAllTimersAsync()
    await staleAssertion

    const completed = await settle(
      submitFollowUpAnswer({
        sessionId: second.session.sessionId,
        version: second.session.version,
        questionId: second.session.question.id,
        followUpQuestionId: second.session.currentFollowUp.question.id,
        content: "我用数据澄清收益，并先通过小范围实验建立共识。",
      }),
    )
    expect(completed.session.status).toBe("evaluating")
    if (completed.session.status !== "evaluating") return
    expect(completed.session.followUpExchanges.map(({ question }) => question.order)).toEqual([
      1, 2,
    ])
    expect(completed.session.version).toBe(second.session.version + 1)
  })

  it("preserves the same pre-submission reference supplement in review", async () => {
    resetPracticeMockState("answeringSingleFollowUp")
    const initial = await settle(getPracticePage())
    if (initial.session.status !== "answeringFollowUp") return
    const input = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
      followUpQuestionId: initial.session.currentFollowUp.question.id,
    }
    const revealed = await settle(requestPracticeFollowUpReferenceAnswer(input))
    if (revealed.session.status !== "answeringFollowUp") return
    const reference = revealed.session.currentFollowUp.question.referenceAnswer
    if (reference.status !== "revealed") return

    const evaluating = await settle(
      submitFollowUpAnswer({
        ...input,
        version: revealed.session.version,
        content: "我会提前确认约束，并用共同约定的结果验证调整是否有效。",
      }),
    )
    if (evaluating.session.status !== "evaluating") return
    const evaluationInput = {
      sessionId: evaluating.session.sessionId,
      version: evaluating.session.version,
      questionId: evaluating.session.question.id,
    }
    await settle(getPracticeEvaluationStatus(evaluationInput))
    const reviewed = await settle(getPracticeEvaluationStatus(evaluationInput))
    if (reviewed.session.status !== "review") return
    expect(reviewed.session.followUpExchanges[0]?.question.referenceAnswer).toEqual(reference)
    expect(
      reviewed.session.followUpExchanges[0]?.question.referenceAnswer.viewedBeforeSubmission,
    ).toBe(true)
  })

  it("records an unanswered follow-up when the candidate ends early", async () => {
    resetPracticeMockState("answeringFollowUp")
    const initial = await settle(getPracticePage())
    if (initial.session.status !== "answeringFollowUp") return

    const completed = await settle(
      endPracticeFollowUps({
        sessionId: initial.session.sessionId,
        version: initial.session.version,
        questionId: initial.session.question.id,
        followUpQuestionId: initial.session.currentFollowUp.question.id,
      }),
    )

    expect(completed.session.status).toBe("evaluating")
    if (completed.session.status !== "evaluating") return
    expect(completed.session.followUpCompletion).toEqual({
      status: "endedEarly",
      unansweredQuestion: initial.session.currentFollowUp.question,
    })
    expect(completed.session.followUpExchanges).toEqual(initial.session.followUpExchanges)
    expect("currentFollowUp" in completed.session).toBe(false)
  })

  it("polls evaluation into a complete eight-dimension review", async () => {
    resetPracticeMockState("evaluatingAnswer")
    const initial = await settle(getPracticePage())
    if (initial.session.status !== "evaluating") return
    const input = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
    }

    const pending = await settle(getPracticeEvaluationStatus(input))
    const completed = await settle(getPracticeEvaluationStatus(input))

    expect(pending.session).toEqual(initial.session)
    expect(completed.session.status).toBe("review")
    if (completed.session.status !== "review") return
    expect(completed.session.version).toBe(initial.session.version + 1)
    expect(completed.session.mainAnswer).toEqual(initial.session.mainAnswer)
    expect(completed.session.followUpExchanges).toHaveLength(
      initial.session.followUpExchanges.length,
    )
    for (const exchange of completed.session.followUpExchanges) {
      expect(exchange.question.referenceAnswer.status).toBe("revealed")
      expect(exchange.question.referenceAnswer.viewedBeforeSubmission).toBe(false)
    }
    expect(Date.parse(completed.session.evaluation.evaluatedAt)).toBeGreaterThanOrEqual(
      Date.parse(initial.session.submittedAt),
    )
    expect(completed.session.evaluation.dimensionScores).toHaveLength(8)
    expect(
      completed.session.evaluation.dimensionScores.every((item) => item.explanation.trim()),
    ).toBe(true)
  })

  it.each([
    ["projectDeepDive", /性能优化|P75|灰度/, /性能治理/],
    ["behavioral", /情境|协作|行动|复盘/, /协作/],
    ["businessUnderstanding", /业务目标|指标|利益相关方|业务影响/, /业务/],
    ["motivation", /岗位|经历|价值|职业/, /性能优化|P75|首屏包体|拆包|性能治理/],
    ["technicalFoundation", /原理|方案|权衡|验证|风险/, /技术/],
  ] satisfies Array<[PracticeQuestionType, RegExp, RegExp]>)(
    "generates a semantic %s evaluation from the real answer flow",
    async (questionType, include, exclude) => {
      const review = await completeQuestionToReview(questionType)
      const content = JSON.stringify({ evaluation: review.evaluation, review: review.review })

      expect(content).toMatch(include)
      if (questionType === "motivation") expect(content).not.toMatch(exclude)
      else expect(content).toMatch(exclude)
      expect(review.evaluation.dimensionScores).toHaveLength(8)
      expect(
        new Set(review.evaluation.dimensionScores.map(({ dimension }) => dimension)).size,
      ).toBe(8)
      expect(
        review.evaluation.dimensionScores.every(
          ({ score }) => Number.isInteger(score) && score >= 0 && score <= 100,
        ),
      ).toBe(true)
      if (review.review.recommendation.action === "nextQuestion") {
        expect(review.review.recommendation.nextQuestion.questionType).toBe(questionType)
        expect(review.review.recommendation.nextQuestion.difficulty).toBe(
          review.selection.difficulty,
        )
        const current = await settle(getPracticePage())
        const role = current.setupContext.targetRoles.find(
          (candidate) => candidate.id === review.selection.targetRoleId,
        )
        expect(role?.supportedQuestionTypes).toContain(
          review.review.recommendation.nextQuestion.questionType,
        )
      }
    },
  )

  it("uses the follow-up completion state to lower an early-ended review and recommend retry", async () => {
    const complete = await completeQuestionToReview("projectDeepDive")
    resetPracticeMockState()
    const endedEarly = await completeQuestionToReview("projectDeepDive", {
      endFollowUpsEarly: true,
    })

    expect(complete.followUpCompletion).toEqual({ status: "completed", reason: "allAnswered" })
    expect(endedEarly.followUpCompletion.status).toBe("endedEarly")
    expect(
      endedEarly.followUpExchanges.every(
        ({ question }) =>
          question.referenceAnswer.status === "revealed" &&
          !question.referenceAnswer.viewedBeforeSubmission,
      ),
    ).toBe(true)
    if (endedEarly.followUpCompletion.status === "endedEarly") {
      expect(endedEarly.followUpCompletion.unansweredQuestion.referenceAnswer.status).toBe(
        "revealed",
      )
      expect(
        endedEarly.followUpCompletion.unansweredQuestion.referenceAnswer.viewedBeforeSubmission,
      ).toBe(false)
    }
    expect(endedEarly.evaluation.overallScore).toBeLessThan(complete.evaluation.overallScore)
    expect(endedEarly.review.recommendation.action).toBe("retryCurrent")
    expect(endedEarly.review.overallPerformance).toContain("追问提前结束")
    expect(endedEarly.review.mainIssues.join(" ")).toContain("未回答追问")
    expect(endedEarly.review.highlights).not.toContain("追问回答补充了关键证据、取舍或风险信息")
  })

  it("retries evaluation as a new version and rejects the stale attempt", async () => {
    resetPracticeMockState("evaluatingFollowUpEndedEarly")
    const initial = await settle(getPracticePage())
    if (initial.session.status !== "evaluating") return
    const oldInput = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
    }
    await settle(getPracticeEvaluationStatus(oldInput))

    const retried = await settle(retryPracticeEvaluation(oldInput))
    expect(retried.session.status).toBe("evaluating")
    if (retried.session.status !== "evaluating") return
    expect(retried.session.version).toBe(initial.session.version + 1)
    expect(retried.session.mainAnswer).toEqual(initial.session.mainAnswer)
    expect(retried.session.followUpCompletion).toEqual(initial.session.followUpCompletion)

    const stale = getPracticeEvaluationStatus(oldInput)
    const staleAssertion = expect(stale).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await staleAssertion

    const newInput = {
      sessionId: retried.session.sessionId,
      version: retried.session.version,
      questionId: retried.session.question.id,
    }
    await settle(getPracticeEvaluationStatus(newInput))
    const completed = await settle(getPracticeEvaluationStatus(newInput))
    expect(completed.session.status).toBe("review")
  })

  it("updates saved and weak state from a review snapshot", async () => {
    resetPracticeMockState("reviewBalanced")
    const initial = await settle(getPracticePage())
    if (initial.session.status !== "review") return
    const input = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
    }

    const saved = await settle(setQuestionSaved({ ...input, isSaved: true }))
    if (saved.session.status !== "review") return
    const weak = await settle(
      setQuestionWeak({
        ...input,
        version: saved.session.version,
        isMarkedWeak: true,
      }),
    )

    expect(saved.session.question.isSaved).toBe(true)
    expect(weak.session.status).toBe("review")
    if (weak.session.status !== "review") return
    expect(weak.session.question).toMatchObject({ isSaved: true, isMarkedWeak: true })
    expect(weak.session.evaluation).toEqual(initial.session.evaluation)
    expect(weak.session.review).toEqual(initial.session.review)
  })

  it("rejects an empty answer without changing the answering snapshot", async () => {
    resetPracticeMockState("answeringQuestion")
    const initial = await settle(getPracticePage())
    if (initial.session.status !== "answering") return
    const submission = submitPrimaryAnswer({
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
      content: "   ",
    })
    const assertion = expect(submission).rejects.toThrow("cannot be empty")

    await vi.runAllTimersAsync()
    await assertion
    expect((await settle(getPracticePage())).session).toEqual(initial.session)
  })

  it("skips into generation and ends from an answering snapshot", async () => {
    resetPracticeMockState("answeringQuestion")
    const initial = await settle(getPracticePage())
    if (initial.session.status !== "answering") return
    const input = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
    }

    const skipped = await settle(skipPracticeQuestion(input))
    expect(skipped.session).toMatchObject({
      status: "generatingQuestion",
      sessionId: initial.session.sessionId,
      version: initial.session.version + 1,
    })

    resetPracticeMockState("answeringQuestion")
    const ending = await settle(getPracticePage())
    if (ending.session.status !== "answering") return
    const ended = await settle(
      requestEndPracticeSession({
        sessionId: ending.session.sessionId,
        version: ending.session.version,
        questionId: ending.session.question.id,
      }),
    )
    expect(ended.session).toMatchObject({
      status: "completed",
      sessionId: ending.session.sessionId,
      version: ending.session.version + 1,
      questionsCompleted: 0,
    })
    expect("question" in ended.session).toBe(false)
    expect("mainAnswer" in ended.session).toBe(false)
    expect("review" in ended.session).toBe(false)
  })

  it("prepares a completed session for another round without retaining session or attempt state", async () => {
    resetPracticeMockState("completedSession")
    const completed = await settle(getPracticePage())
    if (completed.session.status !== "completed") {
      throw new Error("A completed practice fixture is required.")
    }

    const prepared = await settle(
      prepareNextPracticeSession({
        sessionId: completed.session.sessionId,
        version: completed.session.version,
      }),
    )
    if (prepared === "ignored") {
      throw new Error("The mock prepare-next-round service must return a page snapshot.")
    }

    expect(prepared.setupContext).toEqual(completed.setupContext)
    expect(prepared.session).toEqual({
      status: "setup",
      selection: completed.session.selection,
    })
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
      "newWeaknessCount",
      "averageScore",
      "nextStepSuggestion",
    ]) {
      expect(field in prepared.session).toBe(false)
    }

    const targetRoleId = prepared.session.selection.targetRoleId
    if (!targetRoleId) throw new Error("The prepared setup must preserve the target role.")
    const generating = await settle(
      startPracticeSession({ ...prepared.session.selection, targetRoleId }),
    )
    expect(generating.session.status).toBe("generatingQuestion")
    if (generating.session.status !== "generatingQuestion") return
    expect(generating.session.sessionId).not.toBe(completed.session.sessionId)
    expect(generating.session.attemptNumber).toBe(1)
    expect(generating.session.attemptRecords).toEqual([])
  })

  it("keeps a non-default role after preparing the next round and fetching the page again", async () => {
    resetPracticeMockState("completedSession")
    const roles = await settle(getRolesPage())
    const productManager = roles.roles.find((role) => role.id === "role_product_manager_meituan")
    if (!productManager) throw new Error("Expected the Product Manager role fixture.")
    await settle(
      setCurrentTargetRole({ roleId: productManager.id, version: productManager.version }),
    )

    const completed = await settle(getPracticePage())
    if (completed.session.status !== "completed") {
      throw new Error("A completed practice fixture is required.")
    }
    expect(completed.session.selection.targetRoleId).not.toBe(
      completed.setupContext.defaultTargetRoleId,
    )

    const prepared = await settle(
      prepareNextPracticeSession({
        sessionId: completed.session.sessionId,
        version: completed.session.version,
      }),
    )
    if (prepared === "ignored") {
      throw new Error("The mock prepare-next-round service must return a page snapshot.")
    }
    const refreshed = await settle(getPracticePage())
    if (prepared.session.status !== "setup" || refreshed.session.status !== "setup") return

    expect(prepared.session.selection).toEqual(completed.session.selection)
    expect(refreshed.session.selection).toEqual(prepared.session.selection)
  })

  it("falls back to the default role when the previous role no longer exists", async () => {
    resetPracticeMockState("completedSession")
    const roles = await settle(getRolesPage())
    const frontend = roles.roles.find((role) => role.id === "role_frontend_bytedance")
    const productManager = roles.roles.find((role) => role.id === "role_product_manager_meituan")
    if (!frontend || !productManager) throw new Error("Expected both target role fixtures.")

    const rolesWithProductManagerCurrent = await settle(
      setCurrentTargetRole({ roleId: productManager.id, version: productManager.version }),
    )
    const frontendAfterCurrentChange = rolesWithProductManagerCurrent.roles.find(
      (role) => role.id === frontend.id,
    )
    if (!frontendAfterCurrentChange) throw new Error("Expected the Frontend role fixture.")
    await settle(
      deleteTargetRole({
        roleId: frontendAfterCurrentChange.id,
        version: frontendAfterCurrentChange.version,
      }),
    )

    const completed = await settle(getPracticePage())
    if (completed.session.status !== "completed") {
      throw new Error("A completed practice fixture is required.")
    }
    const prepared = await settle(
      prepareNextPracticeSession({
        sessionId: completed.session.sessionId,
        version: completed.session.version,
      }),
    )
    if (prepared === "ignored") {
      throw new Error("The mock prepare-next-round service must return a page snapshot.")
    }
    const refreshed = await settle(getPracticePage())
    if (prepared.session.status !== "setup" || refreshed.session.status !== "setup") return

    expect(prepared.setupContext.defaultTargetRoleId).toBe(productManager.id)
    expect(prepared.session.selection.targetRoleId).toBe(productManager.id)
    expect(refreshed.session.selection).toEqual(prepared.session.selection)
  })

  it("keeps the no-role setup when no practice roles are available", async () => {
    resetPracticeMockState("completedSession")
    resetRolesMockState("noRoles")
    const completed = await settle(getPracticePage())
    if (completed.session.status !== "completed") {
      throw new Error("A completed practice fixture is required.")
    }

    const prepared = await settle(
      prepareNextPracticeSession({
        sessionId: completed.session.sessionId,
        version: completed.session.version,
      }),
    )
    if (prepared === "ignored") {
      throw new Error("The mock prepare-next-round service must return a page snapshot.")
    }
    const refreshed = await settle(getPracticePage())
    if (prepared.session.status !== "setup" || refreshed.session.status !== "setup") return

    expect(prepared.setupContext.targetRoles).toEqual([])
    expect(prepared.session.selection).toEqual({
      ...completed.session.selection,
      targetRoleId: null,
    })
    expect(refreshed.session.selection).toEqual(prepared.session.selection)
  })

  it("rejects prepare-next-round requests with a stale version or different session id", async () => {
    resetPracticeMockState("completedSession")
    const completed = await settle(getPracticePage())
    if (completed.session.status !== "completed") {
      throw new Error("A completed practice fixture is required.")
    }

    const staleVersion = prepareNextPracticeSession({
      sessionId: completed.session.sessionId,
      version: completed.session.version - 1,
    })
    const staleVersionAssertion = expect(staleVersion).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await staleVersionAssertion

    const differentSession = prepareNextPracticeSession({
      sessionId: "practice_session_someone_else",
      version: completed.session.version,
    })
    const differentSessionAssertion =
      expect(differentSession).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await differentSessionAssertion
  })

  it("returns independent deep copies", async () => {
    const first = await settle(getPracticePage())
    const second = await settle(getPracticePage())
    const firstRole = first.setupContext.targetRoles[0]
    if (!firstRole) throw new Error("Expected a target role fixture.")

    firstRole.title = "Mutated role"

    expect(second.setupContext.targetRoles[0]?.title).toBe("Senior Frontend Engineer")
    expect(first).not.toBe(second)
    expect(first.setupContext).not.toBe(second.setupContext)
  })
})
