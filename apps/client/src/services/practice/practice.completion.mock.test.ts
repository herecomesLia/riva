import { describe, expect, it, vi } from "vitest"

import * as context from "./practice.mock-test-utils"

describe("practice stateful mock service: completion", () => {
  it("counts saved and weak status once when both retries end enabled", async () => {
    const { completed, firstReview, retried, secondReview } =
      await context.completeRetriedQuestionWithFinalFlags(
        { isSaved: true, isMarkedWeak: true },
        { isSaved: true, isMarkedWeak: true },
      )

    expect(retried.sessionId).toBe(firstReview.sessionId)
    expect(secondReview.sessionId).toBe(firstReview.sessionId)
    expect(retried.question.id).toBe(firstReview.question.id)
    expect(secondReview.question.id).toBe(firstReview.question.id)
    expect(retried.attemptId).not.toBe(firstReview.attemptId)
    expect(secondReview.attemptId).toBe(retried.attemptId)
    expect(retried.attemptRecords[0]?.question).not.toBe(retried.question)
    expect(retried.question).toMatchObject({ isSaved: true, isMarkedWeak: true })
    expect(completed).toMatchObject({
      questionsCompleted: 1,
      retryCount: 1,
      savedQuestionCount: 1,
      markedWeakQuestionCount: 1,
    })
    expect(completed.attemptRecords).toHaveLength(2)
    expect(completed.attemptRecords.map((record) => record.question.isSaved)).toEqual([true, true])
    expect(completed.attemptRecords.map((record) => record.question.isMarkedWeak)).toEqual([
      true,
      true,
    ])
  })

  it("summarizes one question answered once", async () => {
    const review = await context.finishCurrentAttempt(
      await context.generateQuestion("projectDeepDive"),
    )
    const completed = await context.settle(
      context.endPracticeSession({ sessionId: review.sessionId, version: review.version }),
    )
    if (completed.session.status !== "completed") throw new Error("Expected completed session.")

    expect(completed.session.attemptRecords).toHaveLength(1)
    expect(completed.session).toMatchObject({
      questionsCompleted: 1,
      retryCount: 0,
      finalAttemptAverageScore: review.evaluation.overallScore,
    })
  })

  it("retries one question within the same session and archives both scored attempts", async () => {
    const firstReview = await context.completeQuestionToReview("behavioral", {
      endFollowUpsEarly: true,
    })
    const retried = await context.settle(
      context.retryCurrentPracticeQuestion({
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
    const staleRetry = context.retryCurrentPracticeQuestion({
      sessionId: firstReview.sessionId,
      version: firstReview.version,
      questionId: firstReview.question.id,
    })
    const staleRetryAssertion = expect(staleRetry).rejects.toThrow()
    await vi.runAllTimersAsync()
    await staleRetryAssertion

    const secondReview = await context.finishCurrentAttempt(retried.session)
    const completed = await context.settle(
      context.endPracticeSession({
        sessionId: secondReview.sessionId,
        version: secondReview.version,
      }),
    )
    if (completed.session.status !== "completed") throw new Error("Expected completed session.")
    expect(completed.session.attemptRecords).toHaveLength(2)
    expect(completed.session.questionsCompleted).toBe(1)
    expect(completed.session.retryCount).toBe(1)
    expect(firstReview.evaluation.overallScore).not.toBe(secondReview.evaluation.overallScore)
    expect(completed.session.finalAttemptAverageScore).toBe(secondReview.evaluation.overallScore)
    expect("question" in completed.session).toBe(false)
    expect("review" in completed.session).toBe(false)
  })

  it("continues to a distinct recommended question within the same session", async () => {
    const firstReview = await context.finishCurrentAttempt(
      await context.generateQuestion("motivation"),
    )
    if (firstReview.review.recommendation.action !== "nextQuestion") {
      throw new Error("Expected the completed motivation attempt to recommend the next question.")
    }
    const generating = await context.settle(
      context.continueToNextPracticeQuestion({
        sessionId: firstReview.sessionId,
        version: firstReview.version,
        questionId: firstReview.question.id,
      }),
    )
    if (generating.session.status !== "generatingQuestion") throw new Error("Expected generation.")
    const input = { sessionId: generating.session.sessionId, version: generating.session.version }
    await context.settle(context.getQuestionGenerationStatus(input))
    const next = await context.settle(context.getQuestionGenerationStatus(input))
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

    const secondReview = await context.finishCurrentAttempt(next.session)
    const completed = await context.settle(
      context.endPracticeSession({
        sessionId: secondReview.sessionId,
        version: secondReview.version,
      }),
    )
    if (completed.session.status !== "completed") throw new Error("Expected completed session.")

    expect(new Set(completed.session.attemptRecords.map((record) => record.question.id)).size).toBe(
      2,
    )
    expect(completed.session.questionsCompleted).toBe(2)
    expect(completed.session.retryCount).toBe(0)
    expect(completed.session.finalAttemptAverageScore).toBe(
      Math.round((firstReview.evaluation.overallScore + secondReview.evaluation.overallScore) / 2),
    )
  })

  it("keeps completed history when ending before the generated next question is answered", async () => {
    const firstReview = await context.finishCurrentAttempt(
      await context.generateQuestion("motivation"),
    )
    const generating = await context.settle(
      context.continueToNextPracticeQuestion({
        sessionId: firstReview.sessionId,
        version: firstReview.version,
        questionId: firstReview.question.id,
      }),
    )
    if (generating.session.status !== "generatingQuestion") throw new Error("Expected generation.")
    const input = { sessionId: generating.session.sessionId, version: generating.session.version }
    await context.settle(context.getQuestionGenerationStatus(input))
    const next = await context.settle(context.getQuestionGenerationStatus(input))
    if (next.session.status !== "answering") throw new Error("Expected answering next question.")
    const completed = await context.settle(
      context.requestEndPracticeSession({
        sessionId: next.session.sessionId,
        version: next.session.version,
        questionId: next.session.question.id,
      }),
    )
    if (completed.session.status !== "completed") throw new Error("Expected completed session.")
    expect(completed.session.attemptRecords).toHaveLength(1)
    expect(completed.session.questionsCompleted).toBe(1)
    expect(completed.session.retryCount).toBe(0)
    expect(completed.session.finalAttemptAverageScore).toBe(firstReview.evaluation.overallScore)
    expect("question" in completed.session).toBe(false)
    expect("mainAnswer" in completed.session).toBe(false)
    expect("review" in completed.session).toBe(false)
  })
  it("preserves a reviewed attempt when retrying and completes a session with records", async () => {
    const review = await context.completeQuestionToReview("behavioral")
    const retried = await context.settle(
      context.retryCurrentPracticeQuestion({
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

    const nextReview = await context.completeQuestionToReview("motivation")
    const completed = await context.settle(
      context.endPracticeSession({ sessionId: nextReview.sessionId, version: nextReview.version }),
    )
    expect(completed.session.status).toBe("completed")
    if (completed.session.status !== "completed") return
    expect(completed.session.attemptRecords).toHaveLength(1)
    expect(completed.session.finalAttemptAverageScore).toBeGreaterThan(0)
  })
})
