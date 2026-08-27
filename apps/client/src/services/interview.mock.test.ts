import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createInterviewAgentPlanMock,
  createInterviewCompletedSessionMock,
  defaultInterviewConfigurationMock,
  type InterviewAgentMockScenario,
} from "@/mocks/data/interview"
import {
  beginInterviewQuestions,
  endInterview,
  finishInterview,
  getInterviewPage,
  getInterviewReview,
  prepareInterviewTrainingEntry,
  resetInterviewMockState,
  startInterview,
  submitCandidateQuestion,
  submitInterviewAnswer,
  type InterviewMockControllerOptions,
} from "@/mocks/services/interview"
import {
  createTargetRole,
  deleteTargetRole,
  getJobDescriptionParsingStatus,
  getRolesMockSnapshot,
  resetRolesMockState,
  saveJobDescription,
  updateTargetRole,
} from "@/mocks/services/roles"
import { getProfileMockSnapshot, resetProfileMockState } from "@/mocks/services/profile"
import type {
  GetInterviewReviewResponse,
  InterviewCandidateQuestionsSessionResponse,
  InterviewFollowUpSessionResponse,
  InterviewOpeningSessionResponse,
  InterviewQuestionSessionResponse,
  InterviewScoreDimension,
} from "@/models/interview"

type TerminalInterviewReviewResponse = Exclude<GetInterviewReviewResponse, { status: "generating" }>

function resetScenario(
  agentScenario: InterviewAgentMockScenario = "singleFollowUp",
  controller: Omit<InterviewMockControllerOptions, "agentScenario"> = {},
) {
  resetInterviewMockState("setupReady", {
    defaultDelayMs: 0,
    ...controller,
    agentScenario,
  })
}

function createPlan(
  scenario: InterviewAgentMockScenario,
  configuration = defaultInterviewConfigurationMock,
) {
  return createInterviewAgentPlanMock({ ...configuration, scenario })
}

beforeEach(() => {
  resetRolesMockState()
  resetProfileMockState()
  resetScenario()
})

async function startOpening(
  agentScenario: InterviewAgentMockScenario = "singleFollowUp",
): Promise<InterviewOpeningSessionResponse> {
  resetScenario(agentScenario)
  return startCurrentOpening()
}

async function startCurrentOpening(): Promise<InterviewOpeningSessionResponse> {
  const page = await getInterviewPage()
  const configuration = page.setup.defaultConfiguration
  if (configuration.targetRoleId === null) throw new Error("Expected a default target role.")

  const response = await startInterview({
    ...configuration,
    targetRoleId: configuration.targetRoleId,
  })
  if (response.session?.status !== "opening") throw new Error("Expected interview opening.")
  return response.session
}

async function beginQuestions(
  opening: InterviewOpeningSessionResponse,
): Promise<InterviewQuestionSessionResponse> {
  const response = await beginInterviewQuestions({
    sessionId: opening.sessionId,
    version: opening.version,
  })
  if (response.session?.status !== "question") throw new Error("Expected main question.")
  return response.session
}

async function startToFirstQuestion(agentScenario: InterviewAgentMockScenario = "singleFollowUp") {
  return beginQuestions(await startOpening(agentScenario))
}

async function answerQuestion(
  session: InterviewQuestionSessionResponse,
  content = "这是由用户提交的主问题回答。",
) {
  return submitInterviewAnswer({
    target: "question",
    sessionId: session.sessionId,
    version: session.version,
    questionId: session.currentQuestion.question.id,
    content,
  })
}

async function answerFollowUp(
  session: InterviewFollowUpSessionResponse,
  content = "这是由用户提交的追问回答。",
) {
  return submitInterviewAnswer({
    target: "followUp",
    sessionId: session.sessionId,
    version: session.version,
    questionId: session.currentQuestion.question.id,
    followUpQuestionId: session.currentFollowUp.question.id,
    content,
  })
}

async function reachNoFollowUpsCandidateQuestions() {
  const first = await startToFirstQuestion("noFollowUps")
  const secondResponse = await answerQuestion(first, "第一道主问题回答")
  if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")
  const candidateResponse = await answerQuestion(secondResponse.session, "第二道主问题回答")
  if (candidateResponse.session?.status !== "candidateQuestions") {
    throw new Error("Expected candidate questions.")
  }
  return candidateResponse.session
}

async function finishCandidateQuestions(session: InterviewCandidateQuestionsSessionResponse) {
  const response = await finishInterview({
    sessionId: session.sessionId,
    version: session.version,
  })
  if (response.session?.status !== "completed") throw new Error("Expected completed interview.")
  return response.session
}

async function getTerminalInterviewReview(
  sessionId: string,
): Promise<TerminalInterviewReviewResponse> {
  const first = await getInterviewReview({ sessionId })
  if (first.status !== "generating") return first
  const terminal = await getInterviewReview({ sessionId })
  if (terminal.status === "generating") throw new Error("Expected terminal interview review.")
  return terminal
}

describe("interview Agent mock scenarios", () => {
  it("noFollowUps advances two main questions directly and then enters candidate questions", async () => {
    const plan = createPlan("noFollowUps")
    const first = await startToFirstQuestion("noFollowUps")

    expect(plan.questions).toHaveLength(2)
    expect(first.currentQuestion.question.id).toBe(plan.questions[0]!.question.id)
    expect(first.progress).toEqual({
      completedMainQuestions: 0,
      totalMainQuestions: 2,
      planRevision: 1,
    })

    const secondResponse = await answerQuestion(first)
    expect(secondResponse.session).toMatchObject({
      status: "question",
      progress: { completedMainQuestions: 1, totalMainQuestions: 2 },
      currentQuestion: { question: { id: plan.questions[1]!.question.id } },
    })
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")

    const candidateResponse = await answerQuestion(secondResponse.session)
    expect(candidateResponse.session).toMatchObject({
      status: "candidateQuestions",
      progress: { completedMainQuestions: 2, totalMainQuestions: 2 },
      completedQuestions: [{ followUps: [] }, { followUps: [] }],
    })
  })

  it("singleFollowUp keeps main progress unchanged during its one follow-up", async () => {
    const plan = createPlan("singleFollowUp")
    const first = await startToFirstQuestion("singleFollowUp")
    const secondResponse = await answerQuestion(first)
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")

    const followUpResponse = await answerQuestion(secondResponse.session)
    expect(followUpResponse.session).toMatchObject({
      status: "followUp",
      progress: {
        completedMainQuestions: 1,
        totalMainQuestions: plan.initialProgress.totalMainQuestions,
      },
      currentFollowUp: { question: { id: plan.questions[1]!.followUps[0]!.id } },
    })
    if (followUpResponse.session?.status !== "followUp") throw new Error("Expected follow-up.")

    const nextQuestionResponse = await answerFollowUp(followUpResponse.session)
    expect(nextQuestionResponse.session).toMatchObject({
      status: "question",
      progress: {
        completedMainQuestions: 2,
        totalMainQuestions: plan.initialProgress.totalMainQuestions,
      },
      currentQuestion: { question: { id: plan.questions[2]!.question.id } },
    })
  })

  it("multipleFollowUps preserves both answered follow-ups in order before advancing", async () => {
    const plan = createPlan("multipleFollowUps")
    const first = await startToFirstQuestion("multipleFollowUps")
    const secondResponse = await answerQuestion(first)
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")

    const firstFollowUpResponse = await answerQuestion(secondResponse.session, "主问题回答")
    expect(firstFollowUpResponse.session).toMatchObject({
      status: "followUp",
      currentFollowUp: { question: { id: plan.questions[1]!.followUps[0]!.id } },
    })
    if (firstFollowUpResponse.session?.status !== "followUp") {
      throw new Error("Expected first follow-up.")
    }

    const secondFollowUpResponse = await answerFollowUp(
      firstFollowUpResponse.session,
      "第一轮追问回答",
    )
    expect(secondFollowUpResponse.session).toMatchObject({
      status: "followUp",
      progress: { completedMainQuestions: 1 },
      currentQuestion: {
        answeredFollowUps: [
          {
            question: { id: plan.questions[1]!.followUps[0]!.id },
            answer: { content: "第一轮追问回答" },
          },
        ],
      },
      currentFollowUp: { question: { id: plan.questions[1]!.followUps[1]!.id } },
    })
    if (secondFollowUpResponse.session?.status !== "followUp") {
      throw new Error("Expected second follow-up.")
    }

    const thirdQuestionResponse = await answerFollowUp(
      secondFollowUpResponse.session,
      "第二轮追问回答",
    )
    expect(thirdQuestionResponse.session).toMatchObject({
      status: "question",
      progress: { completedMainQuestions: 2 },
      currentQuestion: { question: { id: plan.questions[2]!.question.id } },
    })
    if (thirdQuestionResponse.session?.status !== "question") {
      throw new Error("Expected third question.")
    }
    expect(thirdQuestionResponse.session.completedQuestions[1]?.followUps).toMatchObject([
      {
        question: { id: plan.questions[1]!.followUps[0]!.id },
        answer: { content: "第一轮追问回答" },
      },
      {
        question: { id: plan.questions[1]!.followUps[1]!.id },
        answer: { content: "第二轮追问回答" },
      },
    ])
  })

  it("lastQuestionFollowUp enters candidate questions after the final follow-up", async () => {
    const plan = createPlan("lastQuestionFollowUp")
    const first = await startToFirstQuestion("lastQuestionFollowUp")
    const lastQuestionResponse = await answerQuestion(first)
    if (lastQuestionResponse.session?.status !== "question") {
      throw new Error("Expected final main question.")
    }

    const followUpResponse = await answerQuestion(lastQuestionResponse.session)
    expect(followUpResponse.session).toMatchObject({
      status: "followUp",
      currentQuestion: { question: { id: plan.questions[1]!.question.id } },
    })
    if (followUpResponse.session?.status !== "followUp") throw new Error("Expected follow-up.")

    const candidateResponse = await answerFollowUp(followUpResponse.session)
    expect(candidateResponse.session).toMatchObject({
      status: "candidateQuestions",
      progress: { completedMainQuestions: 2, totalMainQuestions: 2 },
      completedQuestions: [{ followUps: [] }, { followUps: [{}] }],
    })
  })

  it("unknownTotal remains null throughout the complete formal-question flow", async () => {
    const plan = createPlan("unknownTotal")
    const first = await startToFirstQuestion("unknownTotal")
    expect(first.progress.totalMainQuestions).toBeNull()

    const secondResponse = await answerQuestion(first)
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")
    expect(secondResponse.session.progress).toMatchObject({
      completedMainQuestions: 1,
      totalMainQuestions: null,
    })

    const thirdResponse = await answerQuestion(secondResponse.session)
    if (thirdResponse.session?.status !== "question") throw new Error("Expected third question.")
    expect(thirdResponse.session.progress).toMatchObject({
      completedMainQuestions: 2,
      totalMainQuestions: null,
    })

    const candidateResponse = await answerQuestion(thirdResponse.session)
    expect(candidateResponse.session).toMatchObject({
      status: "candidateQuestions",
      progress: {
        completedMainQuestions: plan.questions.length,
        totalMainQuestions: null,
      },
    })
    if (candidateResponse.session?.status !== "candidateQuestions") {
      throw new Error("Expected candidate questions.")
    }
    const completed = await finishCandidateQuestions(candidateResponse.session)
    expect(completed.reviewStatus).toBe("generating")
    expect("progress" in completed).toBe(false)
    const review = await getTerminalInterviewReview(completed.sessionId)
    if (review.status !== "complete") throw new Error("Expected complete review.")
    expect(review.questionDetails).toHaveLength(plan.questions.length)
  })

  it("adjustedPlan updates total and revision without changing the completed count", async () => {
    const plan = createPlan("adjustedPlan")
    const first = await startToFirstQuestion("adjustedPlan")
    expect(first.progress).toEqual({
      completedMainQuestions: 0,
      ...plan.initialProgress,
    })

    const secondResponse = await answerQuestion(first)
    expect(secondResponse.session).toMatchObject({
      status: "question",
      progress: {
        completedMainQuestions: plan.planChanges[0]!.afterCompletedMainQuestions,
        totalMainQuestions: plan.planChanges[0]!.totalMainQuestions,
        planRevision: plan.planChanges[0]!.planRevision,
      },
    })
  })

  it("uses the selected scenario rather than answer keywords, length, or randomness", async () => {
    const firstShort = await startToFirstQuestion("singleFollowUp")
    const secondShort = await answerQuestion(firstShort, "短")
    if (secondShort.session?.status !== "question") throw new Error("Expected second question.")
    const shortResult = await answerQuestion(secondShort.session, "没有关键词")

    const firstLong = await startToFirstQuestion("singleFollowUp")
    const secondLong = await answerQuestion(firstLong, "完全不同的开场回答")
    if (secondLong.session?.status !== "question") throw new Error("Expected second question.")
    const longResult = await answerQuestion(
      secondLong.session,
      "性能、业务收益、灰度、归因。".repeat(30),
    )

    expect(shortResult.session?.status).toBe("followUp")
    expect(longResult.session?.status).toBe("followUp")
  })
})

describe("interview mock state-machine protection", () => {
  it("rejects an incorrect sessionId", async () => {
    const question = await startToFirstQuestion()

    await expect(
      submitInterviewAnswer({
        target: "question",
        sessionId: "wrong-session",
        version: question.version,
        questionId: question.currentQuestion.question.id,
        content: "有效回答",
      }),
    ).rejects.toThrow("Interview session does not match the current session.")
  })

  it("rejects a stale version", async () => {
    const question = await startToFirstQuestion("noFollowUps")
    await expect(
      submitInterviewAnswer({
        target: "question",
        sessionId: question.sessionId,
        version: question.version - 1,
        questionId: question.currentQuestion.question.id,
        content: "使用过期版本的回答",
      }),
    ).rejects.toThrow("Interview session is out of date.")
  })

  it("rejects duplicate submission of the same answer", async () => {
    const question = await startToFirstQuestion("noFollowUps")
    const input = {
      target: "question" as const,
      sessionId: question.sessionId,
      version: question.version,
      questionId: question.currentQuestion.question.id,
      content: "只能提交一次的回答",
    }
    await submitInterviewAnswer(input)

    await expect(submitInterviewAnswer(input)).rejects.toThrow("Interview session is out of date.")
  })

  it("rejects incorrect main-question and follow-up IDs without consuming state", async () => {
    const first = await startToFirstQuestion("singleFollowUp")
    await expect(
      submitInterviewAnswer({
        target: "question",
        sessionId: first.sessionId,
        version: first.version,
        questionId: "wrong-main-question",
        content: "有效回答",
      }),
    ).rejects.toThrow("Interview question does not match the authoritative session.")

    const secondResponse = await answerQuestion(first)
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")
    const followUpResponse = await answerQuestion(secondResponse.session)
    if (followUpResponse.session?.status !== "followUp") throw new Error("Expected follow-up.")

    await expect(
      submitInterviewAnswer({
        target: "followUp",
        sessionId: followUpResponse.session.sessionId,
        version: followUpResponse.session.version,
        questionId: followUpResponse.session.currentQuestion.question.id,
        followUpQuestionId: "wrong-follow-up",
        content: "有效追问回答",
      }),
    ).rejects.toThrow("Interview follow-up does not match the authoritative session.")
  })

  it("rejects finishing before candidate questions", async () => {
    const opening = await startOpening()
    await expect(
      finishInterview({ sessionId: opening.sessionId, version: opening.version }),
    ).rejects.toThrow("Interview can only finish after entering candidate questions.")
  })

  it("rejects submissions after completion", async () => {
    const candidate = await reachNoFollowUpsCandidateQuestions()
    const completed = await finishCandidateQuestions(candidate)

    await expect(
      submitInterviewAnswer({
        target: "question",
        sessionId: completed.sessionId,
        version: completed.version,
        questionId: "already-completed-question",
        content: "不应被保存",
      }),
    ).rejects.toThrow("Interview session is not active.")
  })

  it("rejects blank main answers and blank follow-up answers", async () => {
    const first = await startToFirstQuestion("singleFollowUp")
    await expect(answerQuestion(first, " \n\t ")).rejects.toThrow(
      "Interview response content is required.",
    )

    const secondResponse = await answerQuestion(first)
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")
    const followUpResponse = await answerQuestion(secondResponse.session)
    if (followUpResponse.session?.status !== "followUp") throw new Error("Expected follow-up.")
    await expect(answerFollowUp(followUpResponse.session, "   ")).rejects.toThrow(
      "Interview response content is required.",
    )
  })

  it("rejects blank candidate questions", async () => {
    const candidate = await reachNoFollowUpsCandidateQuestions()
    await expect(
      submitCandidateQuestion({
        sessionId: candidate.sessionId,
        version: candidate.version,
        content: " \n ",
      }),
    ).rejects.toThrow("Interview response content is required.")
  })
})

describe("interview completion and review availability", () => {
  it("keeps I07/I08 lightweight while I09 owns the generating-to-terminal transition", async () => {
    const first = await startToFirstQuestion("noFollowUps")
    const secondResponse = await answerQuestion(first, "已完成的第一题回答")
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")
    const completion = await endInterview({
      sessionId: secondResponse.session.sessionId,
      version: secondResponse.session.version,
    })

    expect(completion.session).toMatchObject({
      status: "completed",
      reviewStatus: "generating",
    })
    expect("review" in completion.session).toBe(false)
    expect("questionDetails" in completion.session).toBe(false)

    const generating = await getInterviewReview({ sessionId: completion.session.sessionId })
    expect(generating).toEqual({
      status: "generating",
      sessionId: completion.session.sessionId,
      completionReason: "userEndedEarly",
    })
    expect((await getInterviewPage()).session).toMatchObject({ reviewStatus: "generating" })

    const terminal = await getInterviewReview({ sessionId: completion.session.sessionId })
    expect(terminal.status).toBe("partial")
    expect((await getInterviewPage()).session).toMatchObject({ reviewStatus: "partial" })
  })

  it("publishes an explicit failed I09 terminal state when review generation fails", async () => {
    resetScenario("noFollowUps", { reviewGenerationFailure: true })
    const first = await beginQuestions(await startCurrentOpening())
    const secondResponse = await answerQuestion(first)
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")
    const completion = await endInterview({
      sessionId: secondResponse.session.sessionId,
      version: secondResponse.session.version,
    })

    expect((await getInterviewReview({ sessionId: completion.session.sessionId })).status).toBe(
      "generating",
    )
    expect(await getInterviewReview({ sessionId: completion.session.sessionId })).toEqual({
      status: "failed",
      sessionId: completion.session.sessionId,
      completionReason: "userEndedEarly",
      reason: "generationFailed",
    })
    expect(await getInterviewReview({ sessionId: completion.session.sessionId })).toMatchObject({
      status: "failed",
    })
    expect((await getInterviewPage()).session).toMatchObject({ reviewStatus: "failed" })
  })

  it("ends during opening without generating scores or fixed evaluation data", async () => {
    const opening = await startOpening()
    const response = await endInterview({
      sessionId: opening.sessionId,
      version: opening.version,
    })
    if (response.session?.status !== "completed") throw new Error("Expected completion.")

    expect(response.session).toMatchObject({
      status: "completed",
      completionReason: "userEndedEarly",
      reviewStatus: "unavailable",
    })
    expect("review" in response.session).toBe(false)
    expect("questionDetails" in response.session).toBe(false)
    const review = await getTerminalInterviewReview(response.session.sessionId)
    expect(review).toEqual({
      status: "unavailable",
      reason: "insufficientAnswers",
      sessionId: response.session.sessionId,
      completionReason: "userEndedEarly",
      questionDetails: [],
    })
    expect(JSON.stringify(review)).not.toContain("82")
    expect(JSON.stringify(review)).not.toContain("dimensionScores")
    expect(JSON.stringify(review)).not.toContain("mainStrengths")
  })

  it("preserves the first unanswered question as learning content without scoring it", async () => {
    const first = await startToFirstQuestion("noFollowUps")
    const endedImmediately = await endInterview({
      sessionId: first.sessionId,
      version: first.version,
    })
    expect(endedImmediately.session).toMatchObject({
      status: "completed",
      completionReason: "userEndedEarly",
      reviewStatus: "unavailable",
    })
    if (endedImmediately.session?.status !== "completed") throw new Error("Expected completion.")
    const review = await getTerminalInterviewReview(endedImmediately.session.sessionId)
    if (review.status !== "unavailable") throw new Error("Expected unavailable review.")
    expect(review.questionDetails).toHaveLength(1)
    expect(review.questionDetails[0]).toMatchObject({
      record: { status: "unanswered", answer: null },
      performance: null,
      referenceAnswer: { status: "ready" },
    })
    expect(JSON.stringify(review)).not.toContain("dimensionScores")
  })

  it("creates a partial review from exactly one completed main question", async () => {
    const first = await startToFirstQuestion("noFollowUps")
    const secondResponse = await answerQuestion(first, "已完成的第一题回答")
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")
    const endedOnSecond = await endInterview({
      sessionId: secondResponse.session.sessionId,
      version: secondResponse.session.version,
    })
    expect(endedOnSecond.session).toMatchObject({
      status: "completed",
      completionReason: "userEndedEarly",
      reviewStatus: "generating",
    })
    if (endedOnSecond.session?.status !== "completed") throw new Error("Expected completion.")
    const review = await getTerminalInterviewReview(endedOnSecond.session.sessionId)
    if (review.status !== "partial") throw new Error("Expected partial review.")
    expect(review.questionDetails).toHaveLength(2)
    expect(review.review.questionReviews).toHaveLength(1)
    expect(review.questionDetails[0]?.record.question.id).toBe(
      createPlan("noFollowUps").questions[0]!.question.id,
    )
    expect(review.questionDetails[0]).toMatchObject({
      record: { status: "answered", answer: { content: "已完成的第一题回答" } },
      performance: { score: 85 },
      referenceAnswer: { status: "ready" },
    })
    expect(JSON.stringify(review.review)).not.toContain("性能优化")
    expect(JSON.stringify(review.review)).not.toContain("跨团队")
    expect(review.questionDetails[1]).toMatchObject({
      record: { status: "unanswered", answer: null },
      performance: null,
      referenceAnswer: { status: "ready" },
    })
    expect("overallScore" in review.review).toBe(false)
    expect("dimensionScores" in review.review).toBe(false)
  })

  it("preserves an unanswered follow-up without fabricating performance", async () => {
    const plan = createPlan("singleFollowUp")
    const first = await startToFirstQuestion("singleFollowUp")
    const secondResponse = await answerQuestion(first)
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")
    const followUpResponse = await answerQuestion(secondResponse.session, "已回答的主问题")
    if (followUpResponse.session?.status !== "followUp") throw new Error("Expected follow-up.")

    const ended = await endInterview({
      sessionId: followUpResponse.session.sessionId,
      version: followUpResponse.session.version,
    })
    expect(ended.session).toMatchObject({
      status: "completed",
      completionReason: "userEndedEarly",
      reviewStatus: "generating",
    })
    if (ended.session?.status !== "completed") throw new Error("Expected completion.")
    const review = await getTerminalInterviewReview(ended.session.sessionId)
    if (review.status !== "partial") throw new Error("Expected partial review.")
    expect(review.questionDetails).toHaveLength(2)
    expect(review.questionDetails[1]?.followUps).toHaveLength(1)
    expect(review.questionDetails[1]).toMatchObject({
      record: { status: "answered", answer: { content: "已回答的主问题" } },
      performance: { questionId: plan.questions[1]!.question.id },
      referenceAnswer: { status: "ready" },
    })
    expect(review.questionDetails[1]?.followUps[0]).toMatchObject({
      record: {
        status: "unanswered",
        answer: null,
        question: { parentQuestionId: plan.questions[1]!.question.id },
      },
      performance: null,
      referenceAnswer: { status: "ready" },
    })
    const mainReference = review.questionDetails[1]?.referenceAnswer
    const followUpReference = review.questionDetails[1]?.followUps[0]?.referenceAnswer
    expect(mainReference).not.toEqual(followUpReference)
    expect(review.review.questionReviews.map(({ questionId }) => questionId)).toEqual(
      review.questionDetails.map(({ record }) => record.question.id),
    )
  })

  it("preserves answered and unanswered follow-ups in their original order", async () => {
    const plan = createPlan("multipleFollowUps")
    const first = await startToFirstQuestion("multipleFollowUps")
    const secondResponse = await answerQuestion(first)
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")
    const firstFollowUpResponse = await answerQuestion(secondResponse.session)
    if (firstFollowUpResponse.session?.status !== "followUp") {
      throw new Error("Expected first follow-up.")
    }
    const secondFollowUpResponse = await answerFollowUp(
      firstFollowUpResponse.session,
      "已完成的第一轮追问",
    )
    if (secondFollowUpResponse.session?.status !== "followUp") {
      throw new Error("Expected second follow-up.")
    }

    const ended = await endInterview({
      sessionId: secondFollowUpResponse.session.sessionId,
      version: secondFollowUpResponse.session.version,
    })
    if (ended.session?.status !== "completed") throw new Error("Expected completion.")
    expect(ended.session.reviewStatus).toBe("generating")

    const review = await getTerminalInterviewReview(ended.session.sessionId)
    if (review.status !== "partial") throw new Error("Expected partial review.")
    expect(review.questionDetails[1]?.followUps.map(({ record }) => record.question.id)).toEqual([
      plan.questions[1]!.followUps[0]!.id,
      plan.questions[1]!.followUps[1]!.id,
    ])
    expect(review.questionDetails[1]?.followUps.map(({ record }) => record.status)).toEqual([
      "answered",
      "unanswered",
    ])
    expect(review.questionDetails[1]?.followUps[0]?.performance).not.toBeNull()
    expect(review.questionDetails[1]?.followUps[1]?.performance).toBeNull()
    expect(
      review.questionDetails[1]?.followUps.map(({ referenceAnswer }) => referenceAnswer.status),
    ).toEqual(["ready", "ready"])
  })

  it("returns a complete review after the formal-question flow finishes", async () => {
    const candidate = await reachNoFollowUpsCandidateQuestions()
    const completed = await finishCandidateQuestions(candidate)
    expect(completed.completionReason).toBe("formalQuestionsCompleted")
    expect(completed.reviewStatus).toBe("generating")
    expect("review" in completed).toBe(false)
    expect("questionDetails" in completed).toBe(false)

    const review = await getTerminalInterviewReview(completed.sessionId)
    if (review.status !== "complete") throw new Error("Expected complete review.")
    const expectedDimensions: InterviewScoreDimension[] = [
      "relevance",
      "structure",
      "specificity",
      "personalContribution",
      "resultsAndEvidence",
      "roleAlignment",
      "communication",
      "riskControl",
    ]
    expect(review.review.overallScore).toEqual(expect.any(Number))
    expect(review.review.dimensionScores).toHaveLength(8)
    expect(review.review.dimensionScores.map(({ dimension }) => dimension)).toEqual(
      expectedDimensions,
    )
    expect(new Set(review.review.dimensionScores.map(({ dimension }) => dimension)).size).toBe(8)
    review.review.dimensionScores.forEach(({ explanation, score }) => {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
      expect(explanation.trim()).not.toBe("")
    })
    expect(review.review.nextTraining.focusAreas.length).toBeGreaterThan(0)
    expect(review.questionDetails).toHaveLength(createPlan("noFollowUps").questions.length)
    for (const detail of review.questionDetails) {
      expect(detail.record.status).toBe("answered")
      expect(detail.performance).not.toBeNull()
      expect(detail.referenceAnswer.status).toBe("ready")
      for (const followUp of detail.followUps) {
        expect(followUp.record.status).toBe("answered")
        expect(followUp.performance).not.toBeNull()
        expect(followUp.referenceAnswer.status).toBe("ready")
      }
    }
  })

  it("keeps independent main and follow-up references in a normally completed review", async () => {
    const first = await startToFirstQuestion("lastQuestionFollowUp")
    const lastQuestionResponse = await answerQuestion(first)
    if (lastQuestionResponse.session?.status !== "question") {
      throw new Error("Expected final main question.")
    }
    const followUpResponse = await answerQuestion(lastQuestionResponse.session)
    if (followUpResponse.session?.status !== "followUp") throw new Error("Expected follow-up.")
    const candidateResponse = await answerFollowUp(followUpResponse.session)
    if (candidateResponse.session?.status !== "candidateQuestions") {
      throw new Error("Expected candidate questions.")
    }
    const completed = await finishCandidateQuestions(candidateResponse.session)
    const review = await getTerminalInterviewReview(completed.sessionId)
    if (review.status !== "complete") throw new Error("Expected complete review.")

    const main = review.questionDetails[1]
    const followUp = main?.followUps[0]
    expect(main?.record.status).toBe("answered")
    expect(followUp?.record.status).toBe("answered")
    expect(main?.performance).not.toBeNull()
    expect(followUp?.performance).not.toBeNull()
    expect(main?.referenceAnswer.status).toBe("ready")
    expect(followUp?.referenceAnswer.status).toBe("ready")
    expect(main?.referenceAnswer).not.toEqual(followUp?.referenceAnswer)
  })

  it("ends during candidate questions with a complete formal review and exchanges intact", async () => {
    const candidate = await reachNoFollowUpsCandidateQuestions()
    const withExchangeResponse = await submitCandidateQuestion({
      sessionId: candidate.sessionId,
      version: candidate.version,
      content: "这个岗位的成功标准是什么？",
    })
    if (withExchangeResponse.session?.status !== "candidateQuestions") {
      throw new Error("Expected candidate questions.")
    }

    const ended = await endInterview({
      sessionId: withExchangeResponse.session.sessionId,
      version: withExchangeResponse.session.version,
    })
    if (ended.session?.status !== "completed") throw new Error("Expected completion.")
    expect(ended.session.completionReason).toBe("formalQuestionsCompleted")
    expect(ended.session.reviewStatus).toBe("generating")
    expect("candidateQuestionExchanges" in ended.session).toBe(false)

    const review = await getTerminalInterviewReview(ended.session.sessionId)
    if (review.status !== "complete") throw new Error("Expected complete review.")
    expect(review.questionDetails).toHaveLength(2)
  })

  it("returns an immutable persisted learning snapshot for repeated review reads", async () => {
    const first = await startToFirstQuestion("singleFollowUp")
    const endedResponse = await endInterview({
      sessionId: first.sessionId,
      version: first.version,
    })
    if (endedResponse.session?.status !== "completed") throw new Error("Expected completion.")

    const firstRead = await getTerminalInterviewReview(endedResponse.session.sessionId)
    if (firstRead.status !== "unavailable") throw new Error("Expected unavailable review.")
    const original = structuredClone(firstRead)
    const firstReference = firstRead.questionDetails[0]?.referenceAnswer
    if (firstReference?.status !== "ready") throw new Error("Expected ready reference answer.")
    firstReference.content.exampleAnswer = "调用方修改后的内容"
    await startCurrentOpening()

    const secondRead = await getTerminalInterviewReview(endedResponse.session.sessionId)
    if (secondRead.status !== "unavailable") throw new Error("Expected unavailable review.")
    expect(secondRead).toEqual(original)
    expect(secondRead.questionDetails[0]?.referenceAnswer).not.toEqual(firstReference)
  })

  it("restores a completed review after the service lifecycle is reinitialized", async () => {
    const first = await startToFirstQuestion("singleFollowUp")
    const ended = await endInterview({
      sessionId: first.sessionId,
      version: first.version,
    })
    if (ended.session?.status !== "completed") throw new Error("Expected completion.")
    const expected = await getTerminalInterviewReview(ended.session.sessionId)

    resetInterviewMockState("setupReady", {
      clearPersistedSessions: false,
      defaultDelayMs: 0,
    })

    expect(await getTerminalInterviewReview(ended.session.sessionId)).toEqual(expected)
    const next = await startCurrentOpening()
    expect(next.sessionId).toBe("mock-interview-session-2")
    expect(await getTerminalInterviewReview(ended.session.sessionId)).toEqual(expected)
  })

  it("keeps a completed review in memory when repository storage writes fail", async () => {
    const first = await startToFirstQuestion("singleFollowUp")
    const storage = globalThis.sessionStorage
    vi.stubGlobal("sessionStorage", {
      get length() {
        return storage.length
      },
      clear: storage.clear.bind(storage),
      getItem: storage.getItem.bind(storage),
      key: storage.key.bind(storage),
      removeItem: storage.removeItem.bind(storage),
      setItem: vi.fn(() => {
        throw new Error("Storage is unavailable.")
      }),
    })

    try {
      const ended = await endInterview({
        sessionId: first.sessionId,
        version: first.version,
      })
      if (ended.session?.status !== "completed") throw new Error("Expected completion.")
      const expected = await getTerminalInterviewReview(ended.session.sessionId)

      resetInterviewMockState("setupReady", {
        clearPersistedSessions: false,
        defaultDelayMs: 0,
      })

      expect(await getTerminalInterviewReview(ended.session.sessionId)).toEqual(expected)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("rejects a review lookup for an unknown session ID", async () => {
    await expect(getInterviewReview({ sessionId: "missing-session" })).rejects.toThrow(
      "Interview review is not available.",
    )
  })
})

describe("interview mock reset boundaries", () => {
  it("clears persisted reviews by default", async () => {
    resetInterviewMockState("completed", { defaultDelayMs: 0 })
    const completed = await getInterviewPage()
    if (completed.session?.status !== "completed") throw new Error("Expected completion.")

    resetInterviewMockState("setupReady", { defaultDelayMs: 0 })

    await expect(getInterviewReview({ sessionId: completed.session.sessionId })).rejects.toThrow(
      "Interview review is not available.",
    )
  })

  it("clears session, plan cursor, failures, delays, version, and sequences when switching scenarios", async () => {
    resetScenario("multipleFollowUps", {
      delayNext: { getInterviewReview: 1_000 },
      failNext: ["getInterviewReview"],
    })
    const firstMultiple = await beginQuestions(await startCurrentOpening())
    const secondMultipleResponse = await answerQuestion(firstMultiple)
    if (secondMultipleResponse.session?.status !== "question") {
      throw new Error("Expected second multiple-follow-up question.")
    }
    const activeFollowUp = await answerQuestion(secondMultipleResponse.session)
    if (activeFollowUp.session?.status !== "followUp") {
      throw new Error("Expected active multiple-follow-up cursor.")
    }

    resetScenario("noFollowUps")
    const page = await getInterviewPage()
    expect(page.session).toBeNull()

    const first = await beginQuestions(await startCurrentOpening())
    expect(first.sessionId).toBe("mock-interview-session-1")
    expect(first.version).toBe(2)
    expect(first.progress.totalMainQuestions).toBe(2)

    const secondResponse = await answerQuestion(first)
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")
    expect(secondResponse.session.currentQuestion.question.id).toBe(
      createPlan("noFollowUps").questions[1]!.question.id,
    )
  })

  it("returns independent snapshots after every reset and request", async () => {
    const first = await getInterviewPage()
    first.setup.targetRoles[0]!.title = "被测试修改的岗位"
    first.setup.availableDurationMinutes.push(15)

    const second = await getInterviewPage()
    expect(second.setup.targetRoles[0]?.title).toBe("Senior Frontend Engineer")
    expect(second.setup.availableDurationMinutes).toEqual([15, 30, 45])
    expect(getRolesMockSnapshot().roles[0]?.title).toBe("Senior Frontend Engineer")

    resetScenario("adjustedPlan")
    const afterReset = await getInterviewPage()
    expect(afterReset.session).toBeNull()
    expect(afterReset.setup.targetRoles[0]?.title).toBe("Senior Frontend Engineer")
  })

  it("returns independent Agent plans for tests and Stories", () => {
    const first = createPlan("multipleFollowUps")
    first.questions[1]!.question.prompt = "被测试修改的主问题"
    first.questions[1]!.followUps[0]!.prompt = "被测试修改的追问"

    const second = createPlan("multipleFollowUps")
    expect(second.questions[1]!.question.prompt).not.toBe("被测试修改的主问题")
    expect(second.questions[1]!.followUps[0]!.prompt).not.toBe("被测试修改的追问")
  })

  it("keeps operation failure injection one-shot without consuming session state", async () => {
    resetScenario("noFollowUps", { failNext: ["submitInterviewAnswer"] })
    const page = await getInterviewPage()
    const configuration = page.setup.defaultConfiguration
    if (configuration.targetRoleId === null) throw new Error("Expected target role.")
    const openingResponse = await startInterview({
      ...configuration,
      targetRoleId: configuration.targetRoleId,
    })
    if (openingResponse.session?.status !== "opening") throw new Error("Expected opening.")
    const first = await beginQuestions(openingResponse.session)
    const input = {
      target: "question" as const,
      sessionId: first.sessionId,
      version: first.version,
      questionId: first.currentQuestion.question.id,
      content: "失败后使用相同版本重试",
    }

    await expect(submitInterviewAnswer(input)).rejects.toThrow(
      "Interview mock operation failed: submitInterviewAnswer",
    )
    const retried = await submitInterviewAnswer(input)
    expect(retried.session).toMatchObject({
      status: "question",
      version: first.version + 1,
      progress: { completedMainQuestions: 1 },
    })
  })

  it("derives the current target role name and company from roles state", async () => {
    resetRolesMockState("multipleRoles")
    const roles = getRolesMockSnapshot()
    const currentRole = roles.roles.find(({ id }) => id === roles.currentRoleId)
    const page = await getInterviewPage()

    expect(currentRole).toBeDefined()
    expect(page.setup.defaultConfiguration.targetRoleId).toBe(currentRole?.id)
    expect(page.setup.targetRoles.find(({ id }) => id === currentRole?.id)).toMatchObject({
      title: currentRole?.title,
      company: currentRole?.company,
    })
  })

  it("reflects role updates and deletion without resetting interview state", async () => {
    const before = getRolesMockSnapshot()
    const role = before.roles[0]!
    vi.useFakeTimers()
    try {
      const updatePromise = updateTargetRole({
        roleId: role.id,
        version: role.version,
        title: "Principal Frontend Engineer",
        company: "Riva",
        recruitmentType: role.recruitmentType,
        location: role.location,
        experienceRange: role.experienceRange,
      })
      await vi.runAllTimersAsync()
      const updated = await updatePromise
      const updatedRole = updated.roles.find(({ id }) => id === role.id)!
      const afterUpdate = await getInterviewPage()
      expect(afterUpdate.setup.targetRoles.find(({ id }) => id === role.id)).toMatchObject({
        title: "Principal Frontend Engineer",
        company: "Riva",
      })

      const deletePromise = deleteTargetRole({
        roleId: updatedRole.id,
        version: updatedRole.version,
      })
      await vi.runAllTimersAsync()
      await deletePromise
    } finally {
      vi.useRealTimers()
    }

    resetInterviewMockState("setupReady", { defaultDelayMs: 0 })
    const afterDelete = await getInterviewPage()
    expect(afterDelete.setup.targetRoles.map(({ id }) => id)).not.toContain(role.id)
  })

  it("does not expose newly created roles without a complete interview catalog", async () => {
    vi.useFakeTimers()
    try {
      const createPromise = createTargetRole({
        title: "AI Product Engineer",
        company: "Riva",
        recruitmentType: "experienced",
        location: "Shanghai",
        experienceRange: { minYears: 3, maxYears: null },
        preparationStatus: "preparing",
      })
      await vi.runAllTimersAsync()
      const created = await createPromise
      const createdRole = created.roles.at(-1)!
      const page = await getInterviewPage()

      expect(page.setup.targetRoles.find(({ id }) => id === createdRole.id)).toBeUndefined()
      await expect(
        startInterview({
          targetRoleId: createdRole.id,
          round: "hr",
          difficulty: "basic",
          durationMinutes: 30,
        }),
      ).rejects.toThrow("Interview target role has no complete question catalog.")
    } finally {
      vi.useRealTimers()
    }
  })

  it("rejects an archived target role even when submitted directly", async () => {
    resetRolesMockState("archivedRoles")
    const archivedRole = getRolesMockSnapshot().roles.find(
      ({ preparationStatus }) => preparationStatus === "archived",
    )!

    await expect(
      startInterview({
        targetRoleId: archivedRole.id,
        round: "hr",
        difficulty: "basic",
        durationMinutes: 30,
      }),
    ).rejects.toThrow("Interview target role is archived.")
  })

  it("tracks profile completeness and whether any catalog role has a ready JD", async () => {
    resetRolesMockState("roleWithParsedJobDescription")
    resetProfileMockState("partial")
    expect((await getInterviewPage()).setup.availability).toEqual({
      status: "blocked",
      reason: "profileIncomplete",
    })

    resetProfileMockState()
    expect((await getInterviewPage()).setup.availability).toEqual({ status: "available" })

    resetRolesMockState("singleRoleWithoutJobDescription")
    expect((await getInterviewPage()).setup.availability).toEqual({
      status: "blocked",
      reason: "jobDescriptionMissing",
    })

    resetRolesMockState("noRoles")
    const empty = await getInterviewPage()
    expect(empty.setup.targetRoles).toEqual([])
    expect(empty.setup.defaultConfiguration.targetRoleId).toBeNull()
    expect(empty.session).toBeNull()
  })

  it("exposes only the current trainable role and rejects a catalog role with a missing JD", async () => {
    resetRolesMockState("multipleRoles")
    const page = await getInterviewPage()

    expect(page.setup.targetRoles.map(({ id }) => id)).toEqual(["role_frontend_bytedance"])
    await expect(
      startInterview({
        targetRoleId: "role_product_manager_meituan",
        round: "hr",
        difficulty: "basic",
        durationMinutes: 30,
      }),
    ).rejects.toThrow("Interview target role job description is not ready.")
  })

  it("uses a trainable alternative when the current role JD is missing", async () => {
    resetRolesMockState("multipleRolesCurrentMissing")
    const page = await getInterviewPage()

    expect(page.setup.availability).toEqual({ status: "available" })
    expect(page.setup.targetRoles.map(({ id }) => id)).toEqual(["role_product_manager_meituan"])
    expect(page.setup.defaultConfiguration).toMatchObject({
      targetRoleId: "role_product_manager_meituan",
      round: "hr",
    })

    const started = await startInterview({
      ...page.setup.defaultConfiguration,
      targetRoleId: "role_product_manager_meituan",
    })
    expect(started.session).toMatchObject({
      status: "opening",
      configuration: { targetRoleId: "role_product_manager_meituan", round: "hr" },
    })
  })

  it("blocks setup when every catalog role lacks a ready JD", async () => {
    resetRolesMockState("multipleRolesJdMissing")
    const page = await getInterviewPage()

    expect(page.setup.targetRoles).toEqual([])
    expect(page.setup.defaultConfiguration.targetRoleId).toBeNull()
    expect(page.setup.availability).toEqual({
      status: "blocked",
      reason: "jobDescriptionMissing",
    })
    await expect(
      startInterview({
        targetRoleId: "role_frontend_bytedance",
        round: "technical",
        difficulty: "pressure",
        durationMinutes: 30,
      }),
    ).rejects.toThrow("Interview target role job description is not ready.")
  })

  it("rejects a stale configuration after its target role JD stops being ready", async () => {
    resetRolesMockState("multipleRolesReady")
    const before = await getInterviewPage()
    const product = getRolesMockSnapshot().roles.find(
      ({ id }) => id === "role_product_manager_meituan",
    )!
    const staleConfiguration = {
      targetRoleId: product.id,
      round: "hr" as const,
      difficulty: "basic" as const,
      durationMinutes: 30 as const,
    }
    expect(before.setup.targetRoles.map(({ id }) => id)).toContain(product.id)

    vi.useFakeTimers()
    try {
      const savePromise = saveJobDescription({
        roleId: product.id,
        version: product.version,
        rawText: "Updated product manager job description",
      })
      await vi.runAllTimersAsync()
      await savePromise
    } finally {
      vi.useRealTimers()
    }

    expect((await getInterviewPage()).setup.targetRoles.map(({ id }) => id)).not.toContain(
      product.id,
    )
    await expect(startInterview(staleConfiguration)).rejects.toThrow(
      "Interview target role job description is not ready.",
    )
  })

  it("exposes and starts a catalog role after its missing JD becomes ready", async () => {
    resetRolesMockState("multipleRoles")
    const product = getRolesMockSnapshot().roles.find(
      ({ id }) => id === "role_product_manager_meituan",
    )!
    expect((await getInterviewPage()).setup.targetRoles.map(({ id }) => id)).not.toContain(
      product.id,
    )

    vi.useFakeTimers()
    try {
      const savePromise = saveJobDescription({
        roleId: product.id,
        version: product.version,
        rawText: "Own merchant product strategy, roadmap, collaboration, and measurable outcomes.",
      })
      await vi.runAllTimersAsync()
      const parsing = await savePromise
      const parsingProduct = parsing.roles.find(({ id }) => id === product.id)!
      const parsingPromise = getJobDescriptionParsingStatus({
        roleId: parsingProduct.id,
        version: parsingProduct.version,
        jobDescriptionVersion: parsingProduct.jobDescription.version!,
      })
      await vi.runAllTimersAsync()
      await parsingPromise
    } finally {
      vi.useRealTimers()
    }

    const after = await getInterviewPage()
    expect(after.setup.targetRoles.map(({ id }) => id)).toContain(product.id)
    const started = await startInterview({
      targetRoleId: product.id,
      round: "hr",
      difficulty: "basic",
      durationMinutes: 30,
    })
    expect(started.session).toMatchObject({
      status: "opening",
      configuration: { targetRoleId: product.id },
    })
  })

  it("does not let returned setup mutations contaminate roles, profile, or later responses", async () => {
    const originalRoles = getRolesMockSnapshot()
    const originalProfile = getProfileMockSnapshot()
    const first = await getInterviewPage()
    first.setup.targetRoles[0]!.title = "污染后的岗位"
    first.setup.targetRoles.splice(0)
    first.setup.defaultConfiguration.targetRoleId = null
    first.setup.availability = {
      status: "blocked",
      reason: "profileIncomplete",
    }

    expect(getRolesMockSnapshot()).toEqual(originalRoles)
    expect(getProfileMockSnapshot()).toEqual(originalProfile)
    expect(await getInterviewPage()).toMatchObject({
      setup: {
        availability: { status: "available" },
        defaultConfiguration: { targetRoleId: originalRoles.currentRoleId },
        targetRoles: [
          {
            id: originalRoles.currentRoleId,
            title: originalRoles.roles[0]!.title,
            company: originalRoles.roles[0]!.company,
          },
        ],
      },
    })
  })
})

describe("interview history training entry", () => {
  it.each(["active", "completed"] as const)(
    "prepares a fresh setup from an existing %s session",
    async (scenario) => {
      resetRolesMockState("multipleRolesReady")
      resetInterviewMockState(scenario === "completed" ? "completed" : "setupReady", {
        defaultDelayMs: 0,
      })
      if (scenario === "active") await startCurrentOpening()

      const prepared = await prepareInterviewTrainingEntry({
        targetRoleId: "role_product_manager_meituan",
        round: "technical",
        difficulty: "pressure",
        durationMinutes: 45,
      })

      expect(prepared.page.session).toBeNull()
      expect(prepared.page.setup.defaultConfiguration).toEqual({
        targetRoleId: "role_product_manager_meituan",
        round: "hr",
        difficulty: "pressure",
        durationMinutes: 45,
      })
      expect(prepared.resolution).toMatchObject({
        status: "adjusted",
        adjustments: ["interviewRoundUnsupported"],
      })
      expect(await getInterviewPage()).toEqual(prepared.page)
    },
  )

  it("keeps a deleted history role unselected instead of falling back", async () => {
    const prepared = await prepareInterviewTrainingEntry({
      targetRoleId: "role_missing_or_archived",
      round: "hr",
    })

    expect(prepared.page.setup.defaultConfiguration).toMatchObject({
      targetRoleId: null,
      round: "hr",
    })
    expect(prepared.resolution).toMatchObject({
      status: "roleUnavailable",
      reason: "targetRoleDeleted",
    })
  })

  it("distinguishes archived roles and unmet interview prerequisites", async () => {
    resetRolesMockState("archivedRoles")
    const archived = await prepareInterviewTrainingEntry({
      targetRoleId: "role_frontend_meituan",
      round: "technical",
    })
    expect(archived.page.session).toBeNull()
    expect(archived.page.setup.defaultConfiguration.targetRoleId).toBeNull()
    expect(archived.resolution).toMatchObject({
      status: "roleUnavailable",
      reason: "targetRoleArchived",
    })

    resetRolesMockState("multipleRolesReady")
    resetProfileMockState("partial")
    resetScenario()
    const blocked = await prepareInterviewTrainingEntry({
      targetRoleId: "role_frontend_bytedance",
      round: "technical",
    })
    expect(blocked.resolution).toMatchObject({
      status: "roleUnavailable",
      reason: "targetRolePrerequisiteUnavailable",
    })
  })
})

describe("configuration-driven interview catalogs", () => {
  async function firstQuestionFor(
    configuration: typeof defaultInterviewConfigurationMock,
    scenario: InterviewAgentMockScenario = "singleFollowUp",
  ) {
    resetRolesMockState("multipleRolesReady")
    resetScenario(scenario)
    const opening = await startInterview(configuration)
    if (opening.session?.status !== "opening") throw new Error("Expected interview opening.")
    const response = await beginInterviewQuestions({
      sessionId: opening.session.sessionId,
      version: opening.session.version,
    })
    if (response.session?.status !== "question") throw new Error("Expected interview question.")
    return response.session.currentQuestion.question
  }

  it("serves different role-correct questions for frontend and product configurations", async () => {
    const frontend = await firstQuestionFor({
      ...defaultInterviewConfigurationMock,
      round: "firstBusiness",
      difficulty: "basic",
    })
    const product = await firstQuestionFor({
      ...defaultInterviewConfigurationMock,
      targetRoleId: "role_product_manager_meituan",
      round: "firstBusiness",
      difficulty: "basic",
    })

    expect(frontend.prompt).toContain("前端")
    expect(product.prompt).toContain("商家")
    expect(product.prompt).not.toContain("前端")
    expect(product.id).not.toBe(frontend.id)
  })

  it("has complete questions, reviews, and references for every exposed role configuration", async () => {
    resetRolesMockState("multipleRolesReady")
    const setup = (await getInterviewPage()).setup
    for (const targetRole of setup.targetRoles) {
      for (const round of targetRole.supportedRounds) {
        for (const difficulty of setup.availableDifficulties) {
          const completed = createInterviewCompletedSessionMock({
            agentScenario: "multipleFollowUps",
            configuration: {
              targetRoleId: targetRole.id,
              round,
              difficulty,
              durationMinutes: 30,
            },
          })

          expect(completed.completedQuestions).toHaveLength(3)
          expect(completed.questionDetails.every(({ performance }) => performance !== null)).toBe(
            true,
          )
          expect(
            completed.questionDetails.every(
              ({ followUps, referenceAnswer }) =>
                referenceAnswer.status === "ready" &&
                followUps.every(
                  (followUp) =>
                    followUp.performance !== null && followUp.referenceAnswer.status === "ready",
                ),
            ),
          ).toBe(true)
        }
      }
    }
  })

  it("uses HR question types for HR rounds and professional types for technical rounds", async () => {
    const hr = await firstQuestionFor({
      ...defaultInterviewConfigurationMock,
      round: "hr",
      difficulty: "basic",
    })
    const technical = await firstQuestionFor({
      ...defaultInterviewConfigurationMock,
      round: "technical",
      difficulty: "basic",
    })

    expect(hr.type).toBe("motivation")
    expect(technical.type).toBe("technicalOrBusiness")
    expect(hr.prompt).not.toContain("架构")
    expect(technical.prompt).toContain("模块边界")
  })

  it("makes pressure wording and follow-up depth deterministically stronger than basic", () => {
    const basic = createPlan("multipleFollowUps", {
      ...defaultInterviewConfigurationMock,
      difficulty: "basic",
    })
    const pressure = createPlan("multipleFollowUps", {
      ...defaultInterviewConfigurationMock,
      difficulty: "pressure",
    })

    expect(basic.questions.map(({ question }) => question.prompt)).not.toEqual(
      pressure.questions.map(({ question }) => question.prompt),
    )
    expect(basic.questions[1]!.followUps).toHaveLength(1)
    expect(pressure.questions[1]!.followUps).toHaveLength(2)
    expect(pressure.questions[1]!.followUps[0]!.prompt).not.toBe(
      basic.questions[1]!.followUps[0]!.prompt,
    )
  })

  it("returns the same plan for the same complete configuration and scenario", () => {
    const configuration = {
      ...defaultInterviewConfigurationMock,
      round: "comprehensive" as const,
      durationMinutes: 45 as const,
    }

    expect(createPlan("singleFollowUp", configuration)).toEqual(
      createPlan("singleFollowUp", configuration),
    )
  })

  it("provides product-specific reviews and reference answers for shown main and follow-up questions", async () => {
    resetRolesMockState("multipleRolesReady")
    resetScenario("singleFollowUp")
    const openingResponse = await startInterview({
      ...defaultInterviewConfigurationMock,
      targetRoleId: "role_product_manager_meituan",
      round: "firstBusiness",
      difficulty: "pressure",
    })
    if (openingResponse.session?.status !== "opening") throw new Error("Expected opening.")
    const first = await beginQuestions(openingResponse.session)
    const secondResponse = await answerQuestion(first)
    if (secondResponse.session?.status !== "question") throw new Error("Expected second question.")
    const followUpResponse = await answerQuestion(secondResponse.session)
    if (followUpResponse.session?.status !== "followUp") throw new Error("Expected follow-up.")
    const thirdResponse = await answerFollowUp(followUpResponse.session)
    if (thirdResponse.session?.status !== "question") throw new Error("Expected third question.")
    const completed = await endInterview({
      sessionId: thirdResponse.session.sessionId,
      version: thirdResponse.session.version,
    })
    if (completed.session?.status !== "completed") throw new Error("Expected completion.")

    const review = await getTerminalInterviewReview(completed.session.sessionId)
    if (review.status !== "partial") throw new Error("Expected partial review.")
    expect(
      review.questionDetails
        .filter(({ record }) => record.status === "answered")
        .every(({ record }) => !record.question.prompt.includes("前端")),
    ).toBe(true)
    expect(review.questionDetails[0]?.performance).not.toBeNull()
    expect(review.questionDetails[0]?.referenceAnswer.status).toBe("ready")
    expect(review.questionDetails[1]?.followUps[0]?.performance).not.toBeNull()
    expect(review.questionDetails[1]?.followUps[0]?.referenceAnswer.status).toBe("ready")
  })

  it("keeps duration as input without converting it into a fixed question count", () => {
    const short = createPlan("singleFollowUp", {
      ...defaultInterviewConfigurationMock,
      durationMinutes: 15,
    })
    const long = createPlan("singleFollowUp", {
      ...defaultInterviewConfigurationMock,
      durationMinutes: 45,
    })

    expect(short.questions).toEqual(long.questions)
    expect(short.initialProgress).toEqual(long.initialProgress)
  })

  it("rejects unknown roles, unsupported rounds, difficulties, and durations", async () => {
    resetRolesMockState("multipleRolesReady")
    resetScenario()
    const configuration = defaultInterviewConfigurationMock

    await expect(
      startInterview({ ...configuration, targetRoleId: "role_unknown" }),
    ).rejects.toThrow("target role does not exist")
    await expect(
      startInterview({
        ...configuration,
        targetRoleId: "role_product_manager_meituan",
        round: "technical",
      }),
    ).rejects.toThrow("round is not supported")
    await expect(
      startInterview({
        ...configuration,
        difficulty: "expert" as typeof configuration.difficulty,
      }),
    ).rejects.toThrow("difficulty preference is not available")
    await expect(
      startInterview({
        ...configuration,
        durationMinutes: 60 as typeof configuration.durationMinutes,
      }),
    ).rejects.toThrow("duration preference is not available")
  })
})
