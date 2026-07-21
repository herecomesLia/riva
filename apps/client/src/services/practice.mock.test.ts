import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createPracticeMockResponse } from "@/mocks/data/practice"
import { reconcilePracticeSetupSelection, resetPracticeMockState } from "@/mocks/services/practice"
import { resetRolesMockState } from "@/mocks/services/roles"
import {
  endPracticeFollowUps,
  getPracticePage,
  getQuestionGenerationStatus,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession,
  submitFollowUpAnswer,
  submitPrimaryAnswer,
} from "@/services/practice"
import { createTargetRole, getRolesPage, setCurrentTargetRole } from "@/services/roles"
import type { PracticeAnsweringState, PracticeQuestionType } from "@/models/practice"

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

  it("records an unanswered follow-up when the candidate ends early", async () => {
    resetPracticeMockState("answeringSingleFollowUp")
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
    expect("currentFollowUp" in completed.session).toBe(false)
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
