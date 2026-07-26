import { describe, expect, it, vi } from "vitest"

import * as context from "./practice.mock-test-utils"

describe("practice stateful mock service: generation", () => {
  it("moves a reviewed attempt into deterministic next-question generation", async () => {
    const review = await context.completeQuestionToReview("motivation")
    const generating = await context.settle(
      context.continueToNextPracticeQuestion({
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
  it("generates a question that matches the selected type and difficulty", async () => {
    const setup = await context.settle(context.getPracticePage())
    const roleId = setup.setupContext.defaultTargetRoleId
    if (!roleId) throw new Error("The default practice setup must include a current role.")

    const generating = await context.settle(
      context.startPracticeSession({
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

    await context.settle(context.getQuestionGenerationStatus(input))
    const answering = await context.settle(context.getQuestionGenerationStatus(input))

    expect(answering.session.status).toBe("answering")
    if (answering.session.status !== "answering") return
    expect(answering.session.question).toMatchObject({
      questionType: "behavioral",
      difficulty: "pressure",
      answerHints: { status: "notRequested", content: null },
      answerFramework: { status: "notRequested", content: null },
    })
  })

  it("generates a distinct next question after skipping", async () => {
    const setup = await context.settle(context.getPracticePage())
    const roleId = setup.setupContext.defaultTargetRoleId
    if (!roleId) throw new Error("The default practice setup must include a current role.")
    const generating = await context.settle(
      context.startPracticeSession({ ...setup.session.selection, targetRoleId: roleId }),
    )
    if (generating.session.status !== "generatingQuestion") return
    const firstPollInput = {
      sessionId: generating.session.sessionId,
      version: generating.session.version,
    }
    await context.settle(context.getQuestionGenerationStatus(firstPollInput))
    const first = await context.settle(context.getQuestionGenerationStatus(firstPollInput))
    if (first.session.status !== "answering") return

    const skipped = await context.settle(
      context.skipPracticeQuestion({
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
    await context.settle(context.getQuestionGenerationStatus(secondPollInput))
    const second = await context.settle(context.getQuestionGenerationStatus(secondPollInput))
    if (second.session.status !== "answering") return

    expect(second.session.sessionId).toBe(first.session.sessionId)
    expect(skipped.session.version).toBe(first.session.version + 1)
    expect(second.session.version).toBe(skipped.session.version + 1)
    expect(second.session.question.id).not.toBe(first.session.question.id)
    expect(second.session.question.prompt).not.toBe(first.session.question.prompt)
  })

  it("rejects stale polling without overwriting a newer session", async () => {
    const setup = await context.settle(context.getPracticePage())
    const roleId = setup.setupContext.defaultTargetRoleId
    if (!roleId) throw new Error("The default practice setup must include a current role.")

    const first = await context.settle(
      context.startPracticeSession({ ...setup.session.selection, targetRoleId: roleId }),
    )
    if (first.session.status !== "generatingQuestion") return

    const second = await context.settle(
      context.startPracticeSession({ ...first.session.selection, difficulty: "pressure" }),
    )
    const stalePoll = context.getQuestionGenerationStatus({
      sessionId: first.session.sessionId,
      version: first.session.version,
    })
    const staleAssertion = expect(stalePoll).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await staleAssertion

    const current = await context.settle(context.getPracticePage())
    expect(current.session).toEqual(second.session)
  })

  it("does not rewrite an active session after the current role changes", async () => {
    const setup = await context.settle(context.getPracticePage())
    const frontendRoleId = setup.setupContext.defaultTargetRoleId
    if (!frontendRoleId) throw new Error("Expected the Frontend role to be current.")

    const active = await context.settle(
      context.startPracticeSession({
        ...setup.session.selection,
        targetRoleId: frontendRoleId,
        questionType: "technicalFoundation",
      }),
    )
    if (active.session.status !== "generatingQuestion") return

    const roles = await context.settle(context.getRolesPage())
    const productManager = roles.roles.find((role) => role.id === "role_product_manager_meituan")
    if (!productManager) throw new Error("Expected the Product Manager role fixture.")
    await context.settle(
      context.setCurrentTargetRole({ roleId: productManager.id, version: productManager.version }),
    )

    const response = await context.settle(context.getPracticePage())
    expect(response.setupContext.defaultTargetRoleId).toBe(productManager.id)
    expect(response.session).toEqual(active.session)
    expect(response.session.selection).toMatchObject({
      targetRoleId: frontendRoleId,
      questionType: "technicalFoundation",
    })
  })

  it("skips into generation and ends from an answering snapshot", async () => {
    context.resetPracticeMockState("answeringQuestion")
    const initial = await context.settle(context.getPracticePage())
    if (initial.session.status !== "answering") return
    const input = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
    }

    const skipped = await context.settle(context.skipPracticeQuestion(input))
    expect(skipped.session).toMatchObject({
      status: "generatingQuestion",
      sessionId: initial.session.sessionId,
      version: initial.session.version + 1,
    })

    context.resetPracticeMockState("answeringQuestion")
    const ending = await context.settle(context.getPracticePage())
    if (ending.session.status !== "answering") return
    const ended = await context.settle(
      context.requestEndPracticeSession({
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
})
