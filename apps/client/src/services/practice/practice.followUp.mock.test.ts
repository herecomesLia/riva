import { describe, expect, it, vi } from "vitest"

import * as context from "./practice.mock-test-utils"

describe("practice stateful mock service: followUp", () => {
  it("submits a trimmed main answer once and enters a stable follow-up", async () => {
    context.resetPracticeMockState("answeringQuestion")
    const initial = await context.settle(context.getPracticePage())
    if (initial.session.status !== "answering") return

    const response = await context.settle(
      context.submitPrimaryAnswer({
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
      prompt: context.getPracticeFollowUpPlan(initial.session.question.templateId)[0]?.prompt,
    })
    expect(response.session.version).toBe(initial.session.version + 1)

    const duplicate = context.submitPrimaryAnswer({
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
    const initial = await context.generateQuestion("motivation")

    const response = await context.settle(
      context.submitPrimaryAnswer({
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
    context.resetPracticeMockState("answeringFirstFollowUp")
    const initial = await context.settle(context.getPracticePage())
    if (initial.session.status !== "answeringFollowUp") return
    const baseInput = {
      sessionId: initial.session.sessionId,
      version: initial.session.version,
      questionId: initial.session.question.id,
      followUpQuestionId: initial.session.currentFollowUp.question.id,
    }

    const hinted = await context.settle(context.requestPracticeFollowUpHint(baseInput))
    if (hinted.session.status !== "answeringFollowUp") return
    expect(hinted.session.version).toBe(initial.session.version + 1)
    expect(hinted.session.mainAnswer).toEqual(initial.session.mainAnswer)
    expect(hinted.session.followUpExchanges).toEqual(initial.session.followUpExchanges)
    expect(hinted.session.currentFollowUp.question.answerHints.status).toBe("revealed")
    expect(hinted.session.currentFollowUp.question.answerFramework.status).toBe("notRequested")
    expect(hinted.session.currentFollowUp.question.referenceAnswer.status).toBe("notRequested")

    const frameworkInput = { ...baseInput, version: hinted.session.version }
    const framed = await context.settle(context.requestPracticeFollowUpFramework(frameworkInput))
    if (framed.session.status !== "answeringFollowUp") return
    expect(framed.session.version).toBe(hinted.session.version + 1)
    expect(framed.session.currentFollowUp.question.answerFramework.status).toBe("revealed")

    const referenceInput = { ...baseInput, version: framed.session.version }
    const referenced = await context.settle(
      context.requestPracticeFollowUpReferenceAnswer(referenceInput),
    )
    if (referenced.session.status !== "answeringFollowUp") return
    const reference = referenced.session.currentFollowUp.question.referenceAnswer
    expect(referenced.session.version).toBe(framed.session.version + 1)
    expect(reference.status).toBe("revealed")
    if (reference.status !== "revealed") return
    expect(reference.viewedBeforeSubmission).toBe(true)
    expect(reference.content.answer).toContain(referenced.session.currentFollowUp.question.prompt)
    expect(reference.content.answer).toContain(referenced.session.question.prompt)
    expect(reference.content.answer).toContain("Senior Frontend Engineer")

    const repeated = await context.settle(
      context.requestPracticeFollowUpReferenceAnswer({
        ...referenceInput,
        version: referenced.session.version,
      }),
    )
    expect(repeated).toEqual({
      ...referenced,
      session: { ...referenced.session, version: referenced.session.version + 1 },
    })
    if (repeated.session.status !== "answeringFollowUp") return

    for (const invalid of [
      { ...baseInput, version: initial.session.version },
      { ...baseInput, version: referenced.session.version, questionId: "wrong-question" },
      {
        ...baseInput,
        version: referenced.session.version,
        followUpQuestionId: "wrong-follow-up",
      },
    ]) {
      const request = context.requestPracticeFollowUpHint(invalid)
      const assertion = expect(request).rejects.toThrow("out of date")
      await vi.runAllTimersAsync()
      await assertion
    }

    const submitted = await context.settle(
      context.submitFollowUpAnswer({
        ...baseInput,
        version: repeated.session.version,
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
    const initial = await context.generateQuestion("behavioral")
    const following = await context.settle(
      context.submitPrimaryAnswer({
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

    const completed = await context.settle(
      context.submitFollowUpAnswer({
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
    const initial = await context.generateQuestion("projectDeepDive")
    const first = await context.settle(
      context.submitPrimaryAnswer({
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
    const second = await context.settle(context.submitFollowUpAnswer(firstInput))
    if (second.session.status !== "answeringFollowUp") {
      throw new Error("Project practice must continue to a second follow-up.")
    }

    expect(second.session.followUpExchanges.map(({ question }) => question.order)).toEqual([1])
    expect(second.session.currentFollowUp.question.order).toBe(2)
    expect(second.session.currentFollowUp.question.prompt).toBe(
      context.getPracticeFollowUpPlan(second.session.question.templateId)[1]?.prompt,
    )
    expect(second.session.currentFollowUp.question.id).not.toBe(firstInput.followUpQuestionId)
    expect(second.session.version).toBe(first.session.version + 1)

    const stale = context.submitFollowUpAnswer(firstInput)
    const staleAssertion = expect(stale).rejects.toThrow("out of date")
    await vi.runAllTimersAsync()
    await staleAssertion

    const completed = await context.settle(
      context.submitFollowUpAnswer({
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
    context.resetPracticeMockState("answeringFollowUp")
    const initial = await context.settle(context.getPracticePage())
    if (initial.session.status !== "answeringFollowUp") return

    const completed = await context.settle(
      context.endPracticeFollowUps({
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

  it("uses the follow-up completion state to lower an early-ended review and recommend retry", async () => {
    const complete = await context.completeQuestionToReview("projectDeepDive")
    context.resetPracticeMockState()
    const endedEarly = await context.completeQuestionToReview("projectDeepDive", {
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
})
