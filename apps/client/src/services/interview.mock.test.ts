import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createInterviewReviewResponseMock,
  type InterviewAgentMockScenario,
} from "@/mocks/data/interview"
import { resetInterviewMockState } from "@/mocks/services/interview"
import type {
  InterviewFollowUpSessionResponse,
  InterviewQuestionSessionResponse,
} from "@/models/interview"
import {
  beginInterviewQuestions,
  endInterview,
  finishInterview,
  getInterviewPage,
  getInterviewReview,
  startInterview,
  submitCandidateQuestion,
  submitInterviewAnswer,
} from "@/services/interview"

beforeEach(() => {
  vi.useFakeTimers()
  resetInterviewMockState()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function settle<T>(promise: Promise<T>) {
  await vi.runAllTimersAsync()
  return promise
}

async function expectMockFailure<T>(request: Promise<T>, operation: string) {
  const assertion = expect(request).rejects.toThrow(`Interview mock operation failed: ${operation}`)
  await vi.runAllTimersAsync()
  await assertion
}

async function startToFirstQuestion(agentScenario: InterviewAgentMockScenario = "singleFollowUp") {
  resetInterviewMockState("setupReady", { agentScenario })
  const page = await settle(getInterviewPage())
  const configuration = page.setup.defaultConfiguration
  if (configuration.targetRoleId === null) throw new Error("Expected a default target role.")

  const opening = await settle(
    startInterview({ ...configuration, targetRoleId: configuration.targetRoleId }),
  )
  if (opening.session?.status !== "opening") throw new Error("Expected interview opening.")

  const firstQuestion = await settle(
    beginInterviewQuestions({
      sessionId: opening.session.sessionId,
      version: opening.session.version,
    }),
  )
  if (firstQuestion.session?.status !== "question") {
    throw new Error("Expected first interview question.")
  }
  return firstQuestion.session
}

async function answerQuestion(
  session: InterviewQuestionSessionResponse,
  content = "这是由用户提交的主问题回答。",
) {
  return settle(
    submitInterviewAnswer({
      target: "question",
      sessionId: session.sessionId,
      version: session.version,
      questionId: session.currentQuestion.question.id,
      content,
    }),
  )
}

async function answerFollowUp(
  session: InterviewFollowUpSessionResponse,
  content = "这是由用户提交的追问回答。",
) {
  return settle(
    submitInterviewAnswer({
      target: "followUp",
      sessionId: session.sessionId,
      version: session.version,
      questionId: session.currentQuestion.question.id,
      followUpQuestionId: session.currentFollowUp.question.id,
      content,
    }),
  )
}

async function finishNoFollowUpsInterview() {
  const first = await startToFirstQuestion("noFollowUps")
  const secondResponse = await answerQuestion(first)
  if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")
  const candidateResponse = await answerQuestion(secondResponse.session)
  if (candidateResponse.session?.status !== "candidateQuestions") {
    throw new Error("Expected candidate questions.")
  }
  const completed = await settle(
    finishInterview({
      sessionId: candidateResponse.session.sessionId,
      version: candidateResponse.session.version,
    }),
  )
  if (completed.session?.status !== "completed") throw new Error("Expected completed interview.")
  return completed.session
}

describe("interview stateful mock service", () => {
  it("supports a plan with a different main-question count and no follow-ups", async () => {
    const first = await startToFirstQuestion("noFollowUps")
    expect(first.progress).toEqual({
      completedMainQuestions: 0,
      totalMainQuestions: 2,
      planRevision: 1,
    })

    const second = await answerQuestion(first)
    expect(second.session).toMatchObject({
      status: "question",
      progress: {
        completedMainQuestions: 1,
        totalMainQuestions: 2,
      },
      currentQuestion: { question: { order: 2 } },
    })
    if (second.session?.status !== "question") throw new Error("Expected second question.")

    const candidate = await answerQuestion(second.session)
    expect(candidate.session).toMatchObject({
      status: "candidateQuestions",
      progress: {
        completedMainQuestions: 2,
        totalMainQuestions: 2,
      },
    })
  })

  it("supports question → followUp → question without deriving the decision in the client", async () => {
    const first = await startToFirstQuestion("singleFollowUp")
    const second = await answerQuestion(first)
    if (second.session?.status !== "question") throw new Error("Expected second question.")

    const followUp = await answerQuestion(second.session, "任意长度、任意内容的回答。")
    expect(followUp.session).toMatchObject({
      status: "followUp",
      progress: { completedMainQuestions: 1 },
      currentQuestion: { answeredFollowUps: [] },
    })
    if (followUp.session?.status !== "followUp") throw new Error("Expected follow-up.")

    const third = await answerFollowUp(followUp.session)
    expect(third.session).toMatchObject({
      status: "question",
      progress: { completedMainQuestions: 2 },
      currentQuestion: { question: { order: 3 } },
    })
  })

  it("supports two consecutive follow-ups before entering the next main question", async () => {
    const first = await startToFirstQuestion("multipleFollowUps")
    const second = await answerQuestion(first)
    if (second.session?.status !== "question") throw new Error("Expected second question.")
    const firstFollowUp = await answerQuestion(second.session)
    if (firstFollowUp.session?.status !== "followUp") {
      throw new Error("Expected first follow-up.")
    }

    const secondFollowUp = await answerFollowUp(firstFollowUp.session)
    expect(secondFollowUp.session).toMatchObject({
      status: "followUp",
      progress: { completedMainQuestions: 1 },
      currentQuestion: { answeredFollowUps: [{ status: "answered" }] },
      currentFollowUp: { question: { order: 2 } },
    })
    if (secondFollowUp.session?.status !== "followUp") {
      throw new Error("Expected second follow-up.")
    }

    const third = await answerFollowUp(secondFollowUp.session)
    expect(third.session).toMatchObject({
      status: "question",
      progress: { completedMainQuestions: 2 },
      completedQuestions: [{}, { followUps: [{}, {}] }],
      currentQuestion: { question: { order: 3 } },
    })
  })

  it("enters candidate questions after a follow-up on the final main question", async () => {
    const first = await startToFirstQuestion("lastQuestionFollowUp")
    const second = await answerQuestion(first)
    if (second.session?.status !== "question") throw new Error("Expected final question.")
    const followUp = await answerQuestion(second.session)
    if (followUp.session?.status !== "followUp") throw new Error("Expected final follow-up.")

    const candidate = await answerFollowUp(followUp.session)
    expect(candidate.session).toMatchObject({
      status: "candidateQuestions",
      progress: {
        completedMainQuestions: 2,
        totalMainQuestions: 2,
      },
      completedQuestions: [{ followUps: [] }, { followUps: [{}] }],
    })
  })

  it("keeps progress valid when the total is unknown", async () => {
    const first = await startToFirstQuestion("unknownTotal")
    expect(first.progress.totalMainQuestions).toBeNull()

    const second = await answerQuestion(first)
    expect(second.session).toMatchObject({
      status: "question",
      progress: {
        completedMainQuestions: 1,
        totalMainQuestions: null,
        planRevision: 1,
      },
    })
  })

  it("returns an explicit plan revision when the Agent adjusts the total", async () => {
    const first = await startToFirstQuestion("adjustedPlan")
    expect(first.progress).toEqual({
      completedMainQuestions: 0,
      totalMainQuestions: 2,
      planRevision: 1,
    })

    const second = await answerQuestion(first)
    expect(second.session).toMatchObject({
      status: "question",
      progress: {
        completedMainQuestions: 1,
        totalMainQuestions: 3,
        planRevision: 2,
      },
    })
  })

  it("does not infer transitions from answer keywords or length", async () => {
    const firstRun = await startToFirstQuestion("singleFollowUp")
    const secondRunStart = await answerQuestion(firstRun, "短")
    if (secondRunStart.session?.status !== "question") throw new Error("Expected second question.")
    const shortAnswerResult = await answerQuestion(secondRunStart.session, "没有任何关键词")

    const repeatedFirst = await startToFirstQuestion("singleFollowUp")
    const repeatedSecond = await answerQuestion(repeatedFirst, "完全不同的开场回答")
    if (repeatedSecond.session?.status !== "question") throw new Error("Expected second question.")
    const longAnswerResult = await answerQuestion(
      repeatedSecond.session,
      "性能、业务收益、灰度、归因。".repeat(30),
    )

    expect(shortAnswerResult.session?.status).toBe("followUp")
    expect(longAnswerResult.session?.status).toBe("followUp")
  })

  it("supports candidate questions and review through public business services", async () => {
    const first = await startToFirstQuestion("lastQuestionFollowUp")
    const second = await answerQuestion(first)
    if (second.session?.status !== "question") throw new Error("Expected second question.")
    const followUp = await answerQuestion(second.session)
    if (followUp.session?.status !== "followUp") throw new Error("Expected follow-up.")
    const candidate = await answerFollowUp(followUp.session)
    if (candidate.session?.status !== "candidateQuestions") {
      throw new Error("Expected candidate questions.")
    }

    const withQuestion = await settle(
      submitCandidateQuestion({
        sessionId: candidate.session.sessionId,
        version: candidate.session.version,
        content: "这个岗位入职六个月后的成功标准是什么？",
      }),
    )
    if (withQuestion.session?.status !== "candidateQuestions") {
      throw new Error("Expected candidate exchange.")
    }
    const completed = await settle(
      finishInterview({
        sessionId: withQuestion.session.sessionId,
        version: withQuestion.session.version,
      }),
    )
    if (completed.session?.status !== "completed") throw new Error("Expected completion.")

    const review = await settle(getInterviewReview({ sessionId: completed.session.sessionId }))
    expect(completed.session.candidateQuestionExchanges).toHaveLength(1)
    expect(review).toEqual(createInterviewReviewResponseMock(completed.session))
  })

  it("allows an early end from a main question or an active follow-up", async () => {
    const question = await startToFirstQuestion("noFollowUps")
    const endedAtQuestion = await settle(
      endInterview({ sessionId: question.sessionId, version: question.version }),
    )
    expect(endedAtQuestion.session).toMatchObject({
      status: "completed",
      progress: { completedMainQuestions: 0 },
      completedQuestions: [],
    })

    const first = await startToFirstQuestion("singleFollowUp")
    const second = await answerQuestion(first)
    if (second.session?.status !== "question") throw new Error("Expected second question.")
    const followUp = await answerQuestion(second.session)
    if (followUp.session?.status !== "followUp") throw new Error("Expected follow-up.")
    const endedAtFollowUp = await settle(
      endInterview({ sessionId: followUp.session.sessionId, version: followUp.session.version }),
    )
    expect(endedAtFollowUp.session).toMatchObject({
      status: "completed",
      progress: { completedMainQuestions: 2 },
      completedQuestions: [{}, { followUps: [] }],
    })
  })

  it("returns independent snapshots across requests and mutations", async () => {
    const first = await settle(getInterviewPage())
    first.setup.targetRoles[0]!.title = "被测试修改的岗位"
    first.setup.availableDurationMinutes.push(15)

    const second = await settle(getInterviewPage())
    expect(second.setup.targetRoles[0]?.title).toBe("高级前端工程师")
    expect(second.setup.availableDurationMinutes).toEqual([15, 30, 45])
    expect(second).not.toBe(first)

    const completed = await finishNoFollowUpsInterview()
    const firstReview = await settle(getInterviewReview({ sessionId: completed.sessionId }))
    firstReview.review.mainStrengths[0] = "被测试修改的优势"
    const secondReview = await settle(getInterviewReview({ sessionId: completed.sessionId }))
    expect(secondReview.review.mainStrengths[0]).toBe("能够把复杂技术问题讲清楚")
  })

  it("does not consume state when answer submission fails and permits retry", async () => {
    resetInterviewMockState("setupReady", {
      agentScenario: "noFollowUps",
      failNext: ["submitInterviewAnswer"],
    })
    const page = await settle(getInterviewPage())
    const configuration = page.setup.defaultConfiguration
    if (configuration.targetRoleId === null) throw new Error("Expected target role.")
    const opening = await settle(
      startInterview({ ...configuration, targetRoleId: configuration.targetRoleId }),
    )
    if (opening.session?.status !== "opening") throw new Error("Expected opening.")
    const firstResponse = await settle(
      beginInterviewQuestions({
        sessionId: opening.session.sessionId,
        version: opening.session.version,
      }),
    )
    if (firstResponse.session?.status !== "question") throw new Error("Expected question.")
    const input = {
      target: "question" as const,
      sessionId: firstResponse.session.sessionId,
      version: firstResponse.session.version,
      questionId: firstResponse.session.currentQuestion.question.id,
      content: "失败后仍应使用相同版本重试。",
    }

    await expectMockFailure(submitInterviewAnswer(input), "submitInterviewAnswer")
    const retried = await settle(submitInterviewAnswer(input))
    expect(retried.session).toMatchObject({
      status: "question",
      version: firstResponse.session.version + 1,
      progress: { completedMainQuestions: 1 },
    })
  })

  it("keeps empty setup and prerequisite states authoritative", async () => {
    resetInterviewMockState("noTargetRoles")
    const empty = await settle(getInterviewPage())
    expect(empty.setup.targetRoles).toEqual([])
    expect(empty.setup.availableDurationMinutes).toEqual([15, 30, 45])
    expect(empty.setup.defaultConfiguration.durationMinutes).toBe(30)

    resetInterviewMockState("prerequisiteNotMet")
    const blocked = await settle(getInterviewPage())
    expect(blocked.setup.availability).toEqual({
      status: "blocked",
      reason: "profileIncomplete",
    })
    const targetRoleId = blocked.setup.defaultConfiguration.targetRoleId
    if (targetRoleId === null) throw new Error("Expected blocked target role.")
    const request = startInterview({
      ...blocked.setup.defaultConfiguration,
      targetRoleId,
    })
    const assertion = expect(request).rejects.toThrow(
      "Interview prerequisite is not met: profileIncomplete.",
    )
    await vi.runAllTimersAsync()
    await assertion
  })
})
