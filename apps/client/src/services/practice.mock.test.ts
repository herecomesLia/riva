import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createPracticeMockResponse } from "@/mocks/data/practice"
import { reconcilePracticeSetupSelection, resetPracticeMockState } from "@/mocks/services/practice"
import { resetRolesMockState } from "@/mocks/services/roles"
import {
  getPracticePage,
  getQuestionGenerationStatus,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession,
  submitPracticeAnswer,
} from "@/services/practice"
import { createTargetRole, getRolesPage, setCurrentTargetRole } from "@/services/roles"

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

describe("practice stateful mock service", () => {
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

  it("synchronizes the practice default after the current role changes", async () => {
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
    expect(response.session.selection.targetRoleId).toBe(productManager.id)
    expect(
      response.setupContext.targetRoles
        .find((role) => role.id === productManager.id)
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

  it("uses the first supported question type when the current role rejects the selection", () => {
    const fixture = createPracticeMockResponse("setupReady")
    if (fixture.session.status !== "setup") return
    const productManager = fixture.setupContext.targetRoles.find(
      (role) => role.id === "role_product_manager_meituan",
    )
    if (!productManager) throw new Error("Expected the Product Manager role fixture.")

    const selection = reconcilePracticeSetupSelection(
      {
        ...fixture.setupContext,
        defaultTargetRoleId: productManager.id,
      },
      {
        ...fixture.session.selection,
        questionType: "technicalFoundation",
        difficulty: "pressure",
        source: "saved",
        prioritizeWeaknesses: true,
      },
    )

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

  it("submits a trimmed main answer into an evaluating snapshot", async () => {
    resetPracticeMockState("answeringQuestion")
    const initial = await settle(getPracticePage())
    if (initial.session.status !== "answering") return

    const response = await settle(
      submitPracticeAnswer({
        sessionId: initial.session.sessionId,
        version: initial.session.version,
        questionId: initial.session.question.id,
        content: "  我通过性能数据定位瓶颈，并推动拆包方案落地。  ",
      }),
    )

    expect(response.session.status).toBe("evaluating")
    if (response.session.status !== "evaluating") return
    expect(response.session.mainAnswer).toMatchObject({
      content: "我通过性能数据定位瓶颈，并推动拆包方案落地。",
      order: 1,
    })
    expect(response.session.followUpExchanges).toEqual([])
    expect(response.session.version).toBe(initial.session.version + 1)
  })

  it("rejects an empty answer without changing the answering snapshot", async () => {
    resetPracticeMockState("answeringQuestion")
    const initial = await settle(getPracticePage())
    if (initial.session.status !== "answering") return
    const submission = submitPracticeAnswer({
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
