import { describe, expect, it, vi } from "vitest"

import * as context from "./practice.mock-test-utils"

async function expectMockFailure<T>(request: Promise<T>, operation: string) {
  const assertion = expect(request).rejects.toThrow(`Practice mock operation failed: ${operation}`)
  await vi.runAllTimersAsync()
  await assertion
}

describe("practice stateful mock service: controlled failures", () => {
  it("fails the next page load once and succeeds on retry", async () => {
    context.resetPracticeMockState("setupReady", {
      failNext: ["getPracticePage"],
    })

    await expectMockFailure(context.getPracticePage(), "getPracticePage")
    await expect(context.settle(context.getPracticePage())).resolves.toMatchObject({
      session: { status: "setup" },
    })
  })

  it("fails generation and evaluation polling without advancing their state", async () => {
    context.resetPracticeMockState("generatingQuestion", {
      failNext: ["getQuestionGenerationStatus"],
    })
    const generating = context.createPracticeMockResponse("generatingQuestion").session
    if (generating.status !== "generatingQuestion") throw new Error("Expected generation.")
    const generationInput = {
      sessionId: generating.sessionId,
      version: generating.version,
    }

    await expectMockFailure(
      context.getQuestionGenerationStatus(generationInput),
      "getQuestionGenerationStatus",
    )
    const firstGenerationPoll = await context.settle(
      context.getQuestionGenerationStatus(generationInput),
    )
    expect(firstGenerationPoll.session.status).toBe("generatingQuestion")

    context.resetPracticeMockState("evaluatingAnswer", {
      failNext: ["getPracticeEvaluationStatus"],
    })
    const evaluating = context.createPracticeMockResponse("evaluatingAnswer").session
    if (evaluating.status !== "evaluating") throw new Error("Expected evaluation.")
    const evaluationInput = {
      sessionId: evaluating.sessionId,
      version: evaluating.version,
      questionId: evaluating.question.id,
    }

    await expectMockFailure(
      context.getPracticeEvaluationStatus(evaluationInput),
      "getPracticeEvaluationStatus",
    )
    const firstEvaluationPoll = await context.settle(
      context.getPracticeEvaluationStatus(evaluationInput),
    )
    expect(firstEvaluationPoll.session.status).toBe("evaluating")
  })

  it("fails evaluation retry once and leaves the failed evaluation retryable", async () => {
    context.resetPracticeMockState("evaluatingAnswer", {
      failNext: ["retryPracticeEvaluation"],
    })
    const evaluating = context.createPracticeMockResponse("evaluatingAnswer").session
    if (evaluating.status !== "evaluating") throw new Error("Expected evaluation.")
    const input = {
      sessionId: evaluating.sessionId,
      version: evaluating.version,
      questionId: evaluating.question.id,
    }

    await expectMockFailure(context.retryPracticeEvaluation(input), "retryPracticeEvaluation")
    const retried = await context.settle(context.retryPracticeEvaluation(input))
    expect(retried.session).toMatchObject({
      status: "evaluating",
      version: evaluating.version + 1,
    })
  })

  it("fails primary and follow-up submissions once without consuming the answer", async () => {
    context.resetPracticeMockState("answeringQuestion", {
      failNext: ["submitPrimaryAnswer"],
    })
    const answering = context.createPracticeMockResponse("answeringQuestion").session
    if (answering.status !== "answering") throw new Error("Expected answering.")
    const primaryInput = {
      sessionId: answering.sessionId,
      version: answering.version,
      questionId: answering.question.id,
      content: "A retryable primary answer.",
    }
    await expectMockFailure(context.submitPrimaryAnswer(primaryInput), "submitPrimaryAnswer")
    await expect(context.settle(context.submitPrimaryAnswer(primaryInput))).resolves.toMatchObject({
      session: { status: "answeringFollowUp" },
    })

    context.resetPracticeMockState("answeringFirstFollowUp", {
      failNext: ["submitFollowUpAnswer"],
    })
    const followUp = context.createPracticeMockResponse("answeringFirstFollowUp").session
    if (followUp.status !== "answeringFollowUp") throw new Error("Expected follow-up.")
    const followUpInput = {
      sessionId: followUp.sessionId,
      version: followUp.version,
      questionId: followUp.question.id,
      followUpQuestionId: followUp.currentFollowUp.question.id,
      content: "A retryable follow-up answer.",
    }
    await expectMockFailure(context.submitFollowUpAnswer(followUpInput), "submitFollowUpAnswer")
    await expect(
      context.settle(context.submitFollowUpAnswer(followUpInput)),
    ).resolves.toMatchObject({
      session: { status: "answeringFollowUp" },
    })
  })

  it("routes flag, skip, and end failures through their service handlers", async () => {
    for (const operation of [
      "setQuestionSaved",
      "setQuestionWeak",
      "skipPracticeQuestion",
      "requestEndPracticeSession",
    ] as const) {
      context.resetPracticeMockState("answeringQuestion", { failNext: [operation] })
      const session = context.createPracticeMockResponse("answeringQuestion").session
      if (session.status !== "answering") throw new Error("Expected answering.")
      const input = {
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.question.id,
      }
      let request: Promise<unknown>
      switch (operation) {
        case "setQuestionSaved":
          request = context.setQuestionSaved({ ...input, isSaved: true })
          break
        case "setQuestionWeak":
          request = context.setQuestionWeak({ ...input, isMarkedWeak: true })
          break
        case "skipPracticeQuestion":
          request = context.skipPracticeQuestion(input)
          break
        case "requestEndPracticeSession":
          request = context.requestEndPracticeSession(input)
          break
      }
      await expectMockFailure(request, operation)
    }

    context.resetPracticeMockState("answeringFirstFollowUp", {
      failNext: ["endPracticeFollowUps"],
    })
    const followUp = context.createPracticeMockResponse("answeringFirstFollowUp").session
    if (followUp.status !== "answeringFollowUp") throw new Error("Expected follow-up.")
    await expectMockFailure(
      context.endPracticeFollowUps({
        sessionId: followUp.sessionId,
        version: followUp.version,
        questionId: followUp.question.id,
        followUpQuestionId: followUp.currentFollowUp.question.id,
      }),
      "endPracticeFollowUps",
    )

    context.resetPracticeMockState("reviewBalanced", {
      failNext: ["endPracticeSession"],
    })
    const review = context.createPracticeMockResponse("reviewBalanced").session
    if (review.status !== "review") throw new Error("Expected review.")
    await expectMockFailure(
      context.endPracticeSession({
        sessionId: review.sessionId,
        version: review.version,
      }),
      "endPracticeSession",
    )
  })

  it("returns one-shot unavailable guidance and reference-answer snapshots", async () => {
    context.resetPracticeMockState("answeringQuestion", {
      unavailableNext: ["requestPracticeHint", "requestPracticeReferenceAnswer"],
    })
    const initial = context.createPracticeMockResponse("answeringQuestion").session
    if (initial.status !== "answering") throw new Error("Expected answering.")
    const baseInput = {
      sessionId: initial.sessionId,
      version: initial.version,
      questionId: initial.question.id,
    }
    const unavailableHint = await context.settle(context.requestPracticeHint(baseInput))
    if (unavailableHint.session.status !== "answering") throw new Error("Expected answering.")
    expect(unavailableHint.session.question.answerHints).toEqual({
      status: "unavailable",
      content: null,
    })

    const unavailableReference = await context.settle(
      context.requestPracticeReferenceAnswer({
        ...baseInput,
        version: unavailableHint.session.version,
      }),
    )
    if (unavailableReference.session.status !== "answering") {
      throw new Error("Expected answering.")
    }
    expect(unavailableReference.session.question.referenceAnswer).toEqual({
      status: "unavailable",
      content: null,
      viewedBeforeSubmission: false,
    })

    const retriedHint = await context.settle(
      context.requestPracticeHint({
        ...baseInput,
        version: unavailableReference.session.version,
      }),
    )
    if (retriedHint.session.status !== "answering") throw new Error("Expected answering.")
    expect(retriedHint.session.question.answerHints.status).toBe("revealed")
  })
})
