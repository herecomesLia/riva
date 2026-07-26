import { describe, expect, it, vi } from "vitest"

import * as context from "./practice.mock-test-utils"

describe("practice stateful mock service: review", () => {
  it("polls evaluation into a complete eight-dimension review", async () => {
    context.resetPracticeMockState("evaluatingAnswer")
    const initial = await context.settle(context.getPracticePage())
    if (initial.session.status !== "evaluating") return
    const input = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
    }

    const pending = await context.settle(context.getPracticeEvaluationStatus(input))
    const completed = await context.settle(context.getPracticeEvaluationStatus(input))

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
  ] satisfies Array<[import("@/models/practice").PracticeQuestionType, RegExp, RegExp]>)(
    "generates a semantic %s evaluation from the real answer flow",
    async (questionType, include, exclude) => {
      const review = await context.completeQuestionToReview(questionType)
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
        const current = await context.settle(context.getPracticePage())
        const role = current.setupContext.targetRoles.find(
          (candidate) => candidate.id === review.selection.targetRoleId,
        )
        expect(role?.supportedQuestionTypes).toContain(
          review.review.recommendation.nextQuestion.questionType,
        )
      }
    },
  )

  it("retries evaluation as a new version and rejects the stale attempt", async () => {
    context.resetPracticeMockState("evaluatingFollowUpEndedEarly")
    const initial = await context.settle(context.getPracticePage())
    if (initial.session.status !== "evaluating") return
    const oldInput = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
    }
    await context.settle(context.getPracticeEvaluationStatus(oldInput))

    const retried = await context.settle(context.retryPracticeEvaluation(oldInput))
    expect(retried.session.status).toBe("evaluating")
    if (retried.session.status !== "evaluating") return
    expect(retried.session.version).toBe(initial.session.version + 1)
    expect(retried.session.mainAnswer).toEqual(initial.session.mainAnswer)
    expect(retried.session.followUpCompletion).toEqual(initial.session.followUpCompletion)

    const stale = context.getPracticeEvaluationStatus(oldInput)
    const staleAssertion = expect(stale).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await staleAssertion

    const newInput = {
      sessionId: retried.session.sessionId,
      version: retried.session.version,
      questionId: retried.session.question.id,
    }
    await context.settle(context.getPracticeEvaluationStatus(newInput))
    const completed = await context.settle(context.getPracticeEvaluationStatus(newInput))
    expect(completed.session.status).toBe("review")
  })

  it("updates saved and weak state from a review snapshot", async () => {
    context.resetPracticeMockState("reviewBalanced")
    const initial = await context.settle(context.getPracticePage())
    if (initial.session.status !== "review") return
    const input = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
    }

    const saved = await context.settle(context.setQuestionSaved({ ...input, isSaved: true }))
    if (saved.session.status !== "review") return
    const weak = await context.settle(
      context.setQuestionWeak({
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
})
