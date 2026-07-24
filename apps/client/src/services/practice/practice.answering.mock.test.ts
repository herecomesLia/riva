import { describe, expect, it, vi } from "vitest"

import * as context from "./practice.mock-test-utils"

describe("practice stateful mock service: answering", () => {
  it("matches both technical questions to different template-specific answers", async () => {
    const first = await context.revealReferenceAnswer(
      await context.generateQuestion("technicalFoundation"),
    )
    const firstReference = context.getRevealedReferenceAnswer(first)
    expect(first.question.templateId).toBe("technicalFoundation.reactRepeatedRendering")
    expect(firstReference.answer).toMatch(/React|Profiler/)

    context.resetPracticeMockState()
    const second = await context.revealReferenceAnswer(
      await context.continueToSecondQuestion("technicalFoundation"),
    )
    const secondReference = context.getRevealedReferenceAnswer(second)
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
      const first = await context.revealReferenceAnswer(
        await context.generateQuestion(questionType),
      )
      const firstReference = context.getRevealedReferenceAnswer(first)
      context.resetPracticeMockState()
      const second = await context.revealReferenceAnswer(
        await context.continueToSecondQuestion(questionType),
      )
      const secondReference = context.getRevealedReferenceAnswer(second)
      expect(second.question.templateId).toBe(id)
      expect(secondReference.answer).toMatch(pattern)
      expect(secondReference.answer).not.toBe(firstReference.answer)
    },
  )

  it("reveals a versioned reference answer without leaving answering", async () => {
    const initial = await context.generateQuestion("projectDeepDive")
    const input = {
      sessionId: initial.sessionId,
      version: initial.version,
      questionId: initial.question.id,
    }
    const response = await context.settle(context.requestPracticeReferenceAnswer(input))
    expect(response.session).toMatchObject({
      status: "answering",
      sessionId: initial.sessionId,
      version: initial.version + 1,
      question: { referenceAnswer: { status: "revealed", viewedBeforeSubmission: true } },
    })
    if (response.session.status !== "answering") return
    expect(response.session.question.referenceAnswer.content).not.toBeNull()
    const staleRequest = context.requestPracticeReferenceAnswer(input)
    const staleExpectation = expect(staleRequest).rejects.toThrow()
    await vi.runAllTimersAsync()
    await staleExpectation
  })

  it("rejects an unknown question when requesting a reference answer", async () => {
    const initial = await context.generateQuestion("behavioral")
    const invalidRequest = context.requestPracticeReferenceAnswer({
      sessionId: initial.sessionId,
      version: initial.version,
      questionId: "unknown-question",
    })
    const invalidExpectation = expect(invalidRequest).rejects.toThrow()
    await vi.runAllTimersAsync()
    await invalidExpectation
  })

  it("adds an unassisted reference answer to review when it was not requested", async () => {
    const review = await context.completeQuestionToReview("technicalFoundation")
    expect(review.question.referenceAnswer).toMatchObject({
      status: "revealed",
      viewedBeforeSubmission: false,
      content: { kind: "technicalReference" },
    })
  })

  it("preserves the same reference answer for retry and resets it for the next question", async () => {
    const initial = await context.generateQuestion("projectDeepDive")
    const revealedResponse = await context.settle(
      context.requestPracticeReferenceAnswer({
        sessionId: initial.sessionId,
        version: initial.version,
        questionId: initial.question.id,
      }),
    )
    if (revealedResponse.session.status !== "answering") throw new Error("Expected answering.")
    const review = await context.finishCurrentAttempt(revealedResponse.session)
    const original = review.question.referenceAnswer
    const retried = await context.settle(
      context.retryCurrentPracticeQuestion({
        sessionId: review.sessionId,
        version: review.version,
        questionId: review.question.id,
      }),
    )
    if (retried.session.status !== "answering") throw new Error("Expected retry answering.")
    expect(context.isCurrentPracticeAttemptRetry(retried.session)).toBe(true)
    expect(retried.session.question.templateId).toBe(review.question.templateId)
    expect(retried.session.question.referenceAnswer).toEqual({
      ...original,
      viewedBeforeSubmission: true,
    })
    expect(retried.session.attemptRecords[0]?.question.templateId).toBe(review.question.templateId)
    expect(retried.session.attemptRecords[0]?.question.referenceAnswer).toEqual(original)

    context.resetPracticeMockState()
    const nextReview = await context.completeQuestionToReview("motivation")
    const generating = await context.settle(
      context.continueToNextPracticeQuestion({
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
    await context.settle(context.getQuestionGenerationStatus(generationInput))
    const next = await context.settle(context.getQuestionGenerationStatus(generationInput))
    if (next.session.status !== "answering") throw new Error("Expected next question.")
    expect(context.isCurrentPracticeAttemptRetry(next.session)).toBe(false)
    expect(next.session.question.referenceAnswer).toEqual({
      status: "notRequested",
      content: null,
      viewedBeforeSubmission: false,
    })
  })

  it("uses the final retried attempt when saved and weak status are cancelled", async () => {
    const { completed, firstReview, retried, secondAnswering, secondReview } =
      await context.completeRetriedQuestionWithFinalFlags(
        { isSaved: true, isMarkedWeak: true },
        { isSaved: false, isMarkedWeak: false },
      )

    expect(retried.sessionId).toBe(firstReview.sessionId)
    expect(secondReview.question.id).toBe(firstReview.question.id)
    expect(retried.attemptId).not.toBe(firstReview.attemptId)
    expect(secondAnswering.attemptRecords[0]?.question).not.toBe(secondAnswering.question)
    expect(secondAnswering.attemptRecords[0]?.question).toMatchObject({
      isSaved: true,
      isMarkedWeak: true,
    })
    expect(secondAnswering.question).toMatchObject({
      isSaved: false,
      isMarkedWeak: false,
    })
    expect(completed).toMatchObject({
      questionsCompleted: 1,
      retryCount: 1,
      savedQuestionCount: 0,
      markedWeakQuestionCount: 0,
    })
    expect(completed.attemptRecords.map((record) => record.question.isSaved)).toEqual([true, false])
    expect(completed.attemptRecords.map((record) => record.question.isMarkedWeak)).toEqual([
      true,
      false,
    ])
  })

  it("uses the final retried attempt when saved and weak status are newly enabled", async () => {
    const { completed, firstReview, retried, secondReview } =
      await context.completeRetriedQuestionWithFinalFlags(
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
      markedWeakQuestionCount: 1,
    })
    expect(completed.attemptRecords.map((record) => record.question.isSaved)).toEqual([false, true])
    expect(completed.attemptRecords.map((record) => record.question.isMarkedWeak)).toEqual([
      false,
      true,
    ])
  })

  it("falls back to an existing selected role when no current role exists", async () => {
    context.resetRolesMockState("rolesWithoutCurrent")

    const response = await context.settle(context.getPracticePage())
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
    const fixture = context.createPracticeMockResponse("setupReady")
    if (fixture.session.status !== "setup") return
    const productManager = fixture.setupContext.targetRoles.find(
      (role) => role.id === "role_product_manager_meituan",
    )
    if (!productManager) throw new Error("Expected the Product Manager role fixture.")

    const selection = context.reconcilePracticeSetupSelection(fixture.setupContext, {
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

  it("derives technical questions for a newly created backend role and recomputes after editing", async () => {
    const roles = await context.settle(
      context.createTargetRole({
        title: "Backend Engineer",
        company: "Riva",
        recruitmentType: "experienced",
        location: null,
        experienceRange: null,
        preparationStatus: "preparing",
      }),
    )
    const createdRole = roles.roles.find((role) => role.title === "Backend Engineer")
    if (!createdRole) throw new Error("Expected the newly created Backend role.")

    const beforeEdit = await context.settle(context.getPracticePage())
    expect(
      beforeEdit.setupContext.targetRoles.find((role) => role.id === createdRole.id)
        ?.supportedQuestionTypes,
    ).toContain("technicalFoundation")

    await context.settle(
      context.updateTargetRole({
        roleId: createdRole.id,
        version: createdRole.version,
        title: "Business Operations Manager",
        company: createdRole.company,
        recruitmentType: createdRole.recruitmentType,
        location: createdRole.location,
        experienceRange: createdRole.experienceRange,
      }),
    )
    const afterEdit = await context.settle(context.getPracticePage())
    const editedPracticeRole = afterEdit.setupContext.targetRoles.find(
      (role) => role.id === createdRole.id,
    )

    expect(editedPracticeRole?.title).toBe("Business Operations Manager")
    expect(editedPracticeRole?.supportedQuestionTypes).toEqual([
      "projectDeepDive",
      "behavioral",
      "businessUnderstanding",
      "motivation",
    ])
  })

  it("does not grant technical questions to a non-technical role", async () => {
    const roles = await context.settle(
      context.createTargetRole({
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

    const response = await context.settle(context.getPracticePage())
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

  it("keeps saved-source generated questions saved", async () => {
    const setup = await context.settle(context.getPracticePage())
    const roleId = setup.setupContext.defaultTargetRoleId
    if (!roleId) throw new Error("The default practice setup must include a current role.")

    const generating = await context.settle(
      context.startPracticeSession({
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

    await context.settle(context.getQuestionGenerationStatus(input))
    const answering = await context.settle(context.getQuestionGenerationStatus(input))

    expect(answering.session.status).toBe("answering")
    if (answering.session.status !== "answering") return
    expect(answering.session.question.isSaved).toBe(true)
    expect(answering.session.question.isMarkedWeak).toBe(false)
  })

  it("reveals guidance once and persists saved and weak states", async () => {
    context.resetPracticeMockState("answeringQuestion")
    const initial = await context.settle(context.getPracticePage())
    if (initial.session.status !== "answering") return
    const questionInput = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
    }

    const hinted = await context.settle(context.requestPracticeHint(questionInput))
    if (hinted.session.status !== "answering") return
    expect(hinted.session.question.answerHints.status).toBe("revealed")
    expect(hinted.session.question.answerHints.content).not.toHaveLength(0)

    const duplicateHint = await context.settle(
      context.requestPracticeHint({ ...questionInput, version: hinted.session.version }),
    )
    if (duplicateHint.session.status !== "answering") return
    expect(duplicateHint.session.version).toBe(hinted.session.version)

    const framed = await context.settle(
      context.requestAnswerFramework({ ...questionInput, version: hinted.session.version }),
    )
    if (framed.session.status !== "answering") return
    expect(framed.session.question.answerFramework.status).toBe("revealed")

    const saved = await context.settle(
      context.setQuestionSaved({
        ...questionInput,
        version: framed.session.version,
        isSaved: true,
      }),
    )
    if (saved.session.status !== "answering") return
    const weak = await context.settle(
      context.setQuestionWeak({
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
    const initial = await context.generateQuestion("behavioral")
    const hinted = await context.settle(
      context.requestPracticeHint({
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
    const initial = await context.generateQuestion("motivation")
    const framed = await context.settle(
      context.requestAnswerFramework({
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
    const initial = await context.generateQuestion("technicalFoundation")
    const input = {
      sessionId: initial.sessionId,
      version: initial.version,
      questionId: initial.question.id,
    }
    const hinted = await context.settle(context.requestPracticeHint(input))
    if (hinted.session.status !== "answering") return
    const framed = await context.settle(
      context.requestAnswerFramework({ ...input, version: hinted.session.version }),
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

  it("preserves the same pre-submission reference supplement in review", async () => {
    context.resetPracticeMockState("answeringSingleFollowUp")
    const initial = await context.settle(context.getPracticePage())
    if (initial.session.status !== "answeringFollowUp") return
    const input = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
      followUpQuestionId: initial.session.currentFollowUp.question.id,
    }
    const revealed = await context.settle(context.requestPracticeFollowUpReferenceAnswer(input))
    if (revealed.session.status !== "answeringFollowUp") return
    const reference = revealed.session.currentFollowUp.question.referenceAnswer
    if (reference.status !== "revealed") return

    const evaluating = await context.settle(
      context.submitFollowUpAnswer({
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
    await context.settle(context.getPracticeEvaluationStatus(evaluationInput))
    const reviewed = await context.settle(context.getPracticeEvaluationStatus(evaluationInput))
    if (reviewed.session.status !== "review") return
    expect(reviewed.session.followUpExchanges[0]?.question.referenceAnswer).toEqual(reference)
    expect(
      reviewed.session.followUpExchanges[0]?.question.referenceAnswer.viewedBeforeSubmission,
    ).toBe(true)
  })

  it("rejects an empty answer without changing the answering snapshot", async () => {
    context.resetPracticeMockState("answeringQuestion")
    const initial = await context.settle(context.getPracticePage())
    if (initial.session.status !== "answering") return
    const submission = context.submitPrimaryAnswer({
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
      content: "   ",
    })
    const assertion = expect(submission).rejects.toThrow("cannot be empty")

    await vi.runAllTimersAsync()
    await assertion
    expect((await context.settle(context.getPracticePage())).session).toEqual(initial.session)
  })

  it("falls back to the default role when the previous role no longer exists", async () => {
    context.resetPracticeMockState("completedSession")
    const roles = await context.settle(context.getRolesPage())
    const frontend = roles.roles.find((role) => role.id === "role_frontend_bytedance")
    const productManager = roles.roles.find((role) => role.id === "role_product_manager_meituan")
    if (!frontend || !productManager) throw new Error("Expected both target role fixtures.")

    const rolesWithProductManagerCurrent = await context.settle(
      context.setCurrentTargetRole({ roleId: productManager.id, version: productManager.version }),
    )
    const frontendAfterCurrentChange = rolesWithProductManagerCurrent.roles.find(
      (role) => role.id === frontend.id,
    )
    if (!frontendAfterCurrentChange) throw new Error("Expected the Frontend role fixture.")
    await context.settle(
      context.deleteTargetRole({
        roleId: frontendAfterCurrentChange.id,
        version: frontendAfterCurrentChange.version,
      }),
    )

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
    if (prepared === "ignored") {
      throw new Error("The mock prepare-next-round service must return a page snapshot.")
    }
    const refreshed = await context.settle(context.getPracticePage())
    if (prepared.session.status !== "setup" || refreshed.session.status !== "setup") return

    expect(prepared.setupContext.defaultTargetRoleId).toBe(productManager.id)
    expect(prepared.session.selection.targetRoleId).toBe(productManager.id)
    expect(refreshed.session.selection).toEqual(prepared.session.selection)
  })
})
