import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetInterviewMockState } from "@/mocks/services/interview"
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

async function startToFirstQuestion() {
  const setup = await settle(getInterviewPage())
  const configuration = setup.setup.defaultConfiguration
  if (configuration.targetRoleId === null) throw new Error("Expected a default target role.")

  const opening = await settle(
    startInterview({
      targetRoleId: configuration.targetRoleId,
      round: configuration.round,
      difficulty: configuration.difficulty,
    }),
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

async function completeInterview() {
  const first = await startToFirstQuestion()
  const second = await settle(
    submitInterviewAnswer({
      target: "question",
      sessionId: first.sessionId,
      version: first.version,
      questionId: first.currentQuestion.question.id,
      content: "我有五年前端开发经验，近两年主要负责核心交易链路的架构和性能治理。",
    }),
  )
  if (second.session?.status !== "question") throw new Error("Expected second question.")
  expect(second.session.progress).toEqual({ completedQuestions: 1, totalQuestions: 3 })

  const followUp = await settle(
    submitInterviewAnswer({
      target: "question",
      sessionId: second.session.sessionId,
      version: second.session.version,
      questionId: second.session.currentQuestion.question.id,
      content: "我通过真实用户监控定位长任务，再分阶段实施拆包、预加载和渲染调度优化。",
    }),
  )
  if (
    followUp.session?.status !== "followUp" ||
    followUp.session.currentFollowUp.status !== "awaitingAnswer"
  ) {
    throw new Error("Expected dynamic follow-up.")
  }
  expect(followUp.session.progress).toEqual({ completedQuestions: 1, totalQuestions: 3 })

  const third = await settle(
    submitInterviewAnswer({
      target: "followUp",
      sessionId: followUp.session.sessionId,
      version: followUp.session.version,
      questionId: followUp.session.currentQuestion.question.id,
      followUpQuestionId: followUp.session.currentFollowUp.question.id,
      content: "我会使用灰度分组和同期对照，排除活动等外部因素后观察核心转化变化。",
    }),
  )
  if (third.session?.status !== "question") throw new Error("Expected final question.")
  expect(third.session.progress).toEqual({ completedQuestions: 2, totalQuestions: 3 })

  const candidateQuestions = await settle(
    submitInterviewAnswer({
      target: "question",
      sessionId: third.session.sessionId,
      version: third.session.version,
      questionId: third.session.currentQuestion.question.id,
      content: "岗位的业务复杂度与我的经验匹配，我希望继续提升架构能力和跨团队影响力。",
    }),
  )
  if (candidateQuestions.session?.status !== "candidateQuestions") {
    throw new Error("Expected candidate questions.")
  }

  const withCandidateQuestion = await settle(
    submitCandidateQuestion({
      sessionId: candidateQuestions.session.sessionId,
      version: candidateQuestions.session.version,
      content: "这个岗位入职后的核心目标和主要协作团队分别是什么？",
    }),
  )
  if (withCandidateQuestion.session?.status !== "candidateQuestions") {
    throw new Error("Expected candidate question exchange.")
  }
  expect(withCandidateQuestion.session.exchanges[0]?.feedback).toMatchObject({
    summary: expect.any(String),
    suggestedAlternatives: [expect.any(String)],
  })

  const completed = await settle(
    finishInterview({
      sessionId: withCandidateQuestion.session.sessionId,
      version: withCandidateQuestion.session.version,
    }),
  )
  if (completed.session?.status !== "completed") throw new Error("Expected completed interview.")
  return completed.session
}

describe("interview stateful mock service", () => {
  it("runs the deterministic interview flow through the public business service", async () => {
    const completed = await completeInterview()
    const review = await settle(getInterviewReview({ sessionId: completed.sessionId }))

    expect(completed.completedQuestions).toHaveLength(3)
    expect(completed.completedQuestions[1]?.followUps).toHaveLength(1)
    expect(completed.candidateQuestionExchanges).toHaveLength(1)
    expect(completed.progress).toEqual({
      completedQuestions: 3,
      totalQuestions: 3,
    })
    expect(review).toEqual({
      sessionId: completed.sessionId,
      review: completed.review,
    })
    expect(review.review.nextTraining).toMatchObject({
      action: "targetedPractice",
      questionType: "projectDeepDive",
    })
  })

  it("returns typed empty setup data without creating a session", async () => {
    resetInterviewMockState("noTargetRoles")

    await expect(settle(getInterviewPage())).resolves.toEqual({
      setup: {
        availableDifficulties: ["basic", "pressure"],
        targetRoles: [],
        defaultConfiguration: {
          targetRoleId: null,
          round: "comprehensive",
          difficulty: "basic",
        },
      },
      session: null,
    })
  })

  it("ends an active interview through the service without counting an unanswered question", async () => {
    const question = await startToFirstQuestion()
    const completed = await settle(
      endInterview({
        sessionId: question.sessionId,
        version: question.version,
      }),
    )

    expect(completed.session).toMatchObject({
      status: "completed",
      progress: {
        completedQuestions: 0,
        totalQuestions: 3,
      },
      completedQuestions: [],
    })
  })

  it("returns independent snapshots for requests and mutations", async () => {
    const first = await settle(getInterviewPage())
    first.setup.targetRoles[0]!.title = "被测试修改的岗位"

    const second = await settle(getInterviewPage())
    expect(second.setup.targetRoles[0]?.title).toBe("高级前端工程师")
    expect(second).not.toBe(first)

    const completed = await completeInterview()
    const firstReview = await settle(getInterviewReview({ sessionId: completed.sessionId }))
    firstReview.review.mainStrengths[0] = "被测试修改的优势"
    const secondReview = await settle(getInterviewReview({ sessionId: completed.sessionId }))
    expect(secondReview.review.mainStrengths[0]).toBe("能够把复杂技术问题讲清楚")
  })

  it("fails answer submission once without consuming the answer", async () => {
    resetInterviewMockState("setupReady", {
      failNext: ["submitInterviewAnswer"],
    })
    const first = await startToFirstQuestion()
    const input = {
      target: "question" as const,
      sessionId: first.sessionId,
      version: first.version,
      questionId: first.currentQuestion.question.id,
      content: "失败后仍可使用相同版本重试的回答。",
    }

    await expectMockFailure(submitInterviewAnswer(input), "submitInterviewAnswer")
    const answered = await settle(submitInterviewAnswer(input))
    expect(answered.session).toMatchObject({
      status: "question",
      version: first.version + 1,
      progress: {
        completedQuestions: 1,
        totalQuestions: 3,
      },
      currentQuestion: {
        status: "awaitingAnswer",
        question: { order: 2 },
      },
    })
  })

  it("fails review loading once and returns the same completed review on retry", async () => {
    resetInterviewMockState("setupReady", {
      failNext: ["getInterviewReview"],
    })
    const completed = await completeInterview()
    const input = { sessionId: completed.sessionId }

    await expectMockFailure(getInterviewReview(input), "getInterviewReview")
    await expect(settle(getInterviewReview(input))).resolves.toEqual({
      sessionId: completed.sessionId,
      review: completed.review,
    })
  })
})
