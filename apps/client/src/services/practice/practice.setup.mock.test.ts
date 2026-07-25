import { describe, expect, it, vi } from "vitest"

import * as context from "./practice.mock-test-utils"

describe("practice stateful mock service: setup", () => {
  it("projects current target-role data from the roles mock service", async () => {
    const response = await context.settle(context.getPracticePage())

    expect(response.setupContext.defaultTargetRoleId).toBe("role_frontend_bytedance")
    expect(response.setupContext.targetRoles).toHaveLength(2)
    expect(response.setupContext.targetRoles[1]).toMatchObject({
      id: "role_product_manager_meituan",
      title: "Product Manager",
      company: "Meituan",
    })
  })

  it("keeps an existing practice role after the current role changes", async () => {
    context.resetPracticeMockState("noEligibleHistoryQuestions")
    const before = await context.settle(context.getPracticePage())
    const roles = await context.settle(context.getRolesPage())
    const productManager = roles.roles.find((role) => role.id === "role_product_manager_meituan")
    if (!productManager) throw new Error("Expected the Product Manager role fixture.")

    await context.settle(
      context.setCurrentTargetRole({ roleId: productManager.id, version: productManager.version }),
    )
    const response = await context.settle(context.getPracticePage())
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

  it("moves from setup through generation to an answering snapshot", async () => {
    const setup = await context.settle(context.getPracticePage())
    if (setup.session.selection.targetRoleId === null) {
      throw new Error("The default practice setup must select a target role.")
    }

    const generating = await context.settle(
      context.startPracticeSession({
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
    const stillGenerating = await context.settle(context.getQuestionGenerationStatus(pollInput))
    const answering = await context.settle(context.getQuestionGenerationStatus(pollInput))

    expect(stillGenerating.session.status).toBe("generatingQuestion")
    expect(answering.session).toMatchObject({
      status: "answering",
      sessionId: generating.session.sessionId,
      version: 2,
    })
  })

  it("prepares a completed session for another round without retaining session or attempt state", async () => {
    context.resetPracticeMockState("completedSession")
    const completed = await context.settle(context.getPracticePage())
    if (completed.session.status !== "completed") {
      throw new Error("A completed practice fixture is required.")
    }

    const prepared = await context.settle(
      context.prepareNextPracticeSession({
        sessionId: completed.session.sessionId,
        version: completed.session.version,
      }),
    )
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
      "markedWeakQuestionCount",
      "finalAttemptAverageScore",
      "nextStepSuggestion",
    ]) {
      expect(field in prepared.session).toBe(false)
    }

    const targetRoleId = prepared.session.selection.targetRoleId
    if (!targetRoleId) throw new Error("The prepared setup must preserve the target role.")
    const generating = await context.settle(
      context.startPracticeSession({ ...prepared.session.selection, targetRoleId }),
    )
    expect(generating.session.status).toBe("generatingQuestion")
    if (generating.session.status !== "generatingQuestion") return
    expect(generating.session.sessionId).not.toBe(completed.session.sessionId)
    expect(generating.session.attemptNumber).toBe(1)
    expect(generating.session.attemptRecords).toEqual([])
  })

  it("keeps a non-default role after preparing the next round and fetching the page again", async () => {
    context.resetPracticeMockState("completedSession")
    const roles = await context.settle(context.getRolesPage())
    const productManager = roles.roles.find((role) => role.id === "role_product_manager_meituan")
    if (!productManager) throw new Error("Expected the Product Manager role fixture.")
    await context.settle(
      context.setCurrentTargetRole({ roleId: productManager.id, version: productManager.version }),
    )

    const completed = await context.settle(context.getPracticePage())
    if (completed.session.status !== "completed") {
      throw new Error("A completed practice fixture is required.")
    }
    expect(completed.session.selection.targetRoleId).not.toBe(
      completed.setupContext.defaultTargetRoleId,
    )

    const prepared = await context.settle(
      context.prepareNextPracticeSession({
        sessionId: completed.session.sessionId,
        version: completed.session.version,
      }),
    )
    const refreshed = await context.settle(context.getPracticePage())
    if (prepared.session.status !== "setup" || refreshed.session.status !== "setup") return

    expect(prepared.session.selection).toEqual(completed.session.selection)
    expect(refreshed.session.selection).toEqual(prepared.session.selection)
  })

  it("keeps the no-role setup when no practice roles are available", async () => {
    context.resetPracticeMockState("completedSession")
    context.resetRolesMockState("noRoles")
    const completed = await context.settle(context.getPracticePage())
    if (completed.session.status !== "completed") {
      throw new Error("A completed practice fixture is required.")
    }

    const prepared = await context.settle(
      context.prepareNextPracticeSession({
        sessionId: completed.session.sessionId,
        version: completed.session.version,
      }),
    )
    const refreshed = await context.settle(context.getPracticePage())
    if (prepared.session.status !== "setup" || refreshed.session.status !== "setup") return

    expect(prepared.setupContext.targetRoles).toEqual([])
    expect(prepared.session.selection).toEqual({
      ...completed.session.selection,
      targetRoleId: null,
    })
    expect(refreshed.session.selection).toEqual(prepared.session.selection)
  })

  it("rejects prepare-next-round requests with a stale version or different session id", async () => {
    context.resetPracticeMockState("completedSession")
    const completed = await context.settle(context.getPracticePage())
    if (completed.session.status !== "completed") {
      throw new Error("A completed practice fixture is required.")
    }

    const staleVersion = context.prepareNextPracticeSession({
      sessionId: completed.session.sessionId,
      version: completed.session.version - 1,
    })
    const staleVersionAssertion = expect(staleVersion).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await staleVersionAssertion

    const differentSession = context.prepareNextPracticeSession({
      sessionId: "practice_session_someone_else",
      version: completed.session.version,
    })
    const differentSessionAssertion =
      expect(differentSession).rejects.toThrow("version is out of date")
    await vi.runAllTimersAsync()
    await differentSessionAssertion
  })

  it.each(["answeringQuestion", "completedSession"] as const)(
    "prepares a history entry as a fresh setup from a %s session",
    async (scenario) => {
      context.resetPracticeMockState(scenario)

      const prepared = await context.settle(
        context.preparePracticeTrainingEntry({
          targetRoleId: "role_product_manager_meituan",
          questionType: "technicalFoundation",
          difficulty: "pressure",
          source: "history",
          prioritizeWeaknesses: true,
        }),
      )

      expect(prepared.session).toEqual({
        status: "setup",
        selection: {
          targetRoleId: "role_product_manager_meituan",
          questionType: "projectDeepDive",
          difficulty: "pressure",
          source: "history",
          prioritizeWeaknesses: true,
        },
      })
      expect(await context.settle(context.getPracticePage())).toEqual(prepared)
    },
  )

  it("falls back from an unavailable history role to the current Roles domain role", async () => {
    const prepared = await context.settle(
      context.preparePracticeTrainingEntry({
        targetRoleId: "role_missing_or_archived",
        questionType: "businessUnderstanding",
      }),
    )

    expect(prepared.session).toMatchObject({
      status: "setup",
      selection: {
        targetRoleId: prepared.setupContext.defaultTargetRoleId,
        questionType: "businessUnderstanding",
      },
    })
  })

  it("returns independent deep copies", async () => {
    const first = await context.settle(context.getPracticePage())
    const second = await context.settle(context.getPracticePage())
    const firstRole = first.setupContext.targetRoles[0]
    if (!firstRole) throw new Error("Expected a target role fixture.")

    firstRole.title = "Mutated role"

    expect(second.setupContext.targetRoles[0]?.title).toBe("Senior Frontend Engineer")
    expect(first).not.toBe(second)
    expect(first.setupContext).not.toBe(second.setupContext)
  })
})
