import { beforeEach, describe, expect, it } from "vitest"

import {
  createInterviewAgentPlanMock,
  createInterviewReviewResponseMock,
  type InterviewAgentMockScenario,
} from "@/mocks/data/interview"
import {
  beginInterviewQuestions,
  endInterview,
  finishInterview,
  getInterviewPage,
  getInterviewReview,
  resetInterviewMockState,
  startInterview,
  submitCandidateQuestion,
  submitInterviewAnswer,
  type InterviewMockControllerOptions,
} from "@/mocks/services/interview"
import type {
  InterviewCandidateQuestionsSessionResponse,
  InterviewFollowUpSessionResponse,
  InterviewOpeningSessionResponse,
  InterviewQuestionSessionResponse,
  InterviewScoreDimension,
} from "@/models/interview"

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

beforeEach(() => {
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

describe("interview Agent mock scenarios", () => {
  it("noFollowUps advances two main questions directly and then enters candidate questions", async () => {
    const plan = createInterviewAgentPlanMock("noFollowUps")
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
    const plan = createInterviewAgentPlanMock("singleFollowUp")
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
    const plan = createInterviewAgentPlanMock("multipleFollowUps")
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
    const plan = createInterviewAgentPlanMock("lastQuestionFollowUp")
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
    const plan = createInterviewAgentPlanMock("unknownTotal")
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
    expect(completed.progress).toMatchObject({
      completedMainQuestions: plan.questions.length,
      totalMainQuestions: null,
    })
  })

  it("adjustedPlan updates total and revision without changing the completed count", async () => {
    const plan = createInterviewAgentPlanMock("adjustedPlan")
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
  it("ends during opening without generating scores or fixed evaluation data", async () => {
    const opening = await startOpening()
    const response = await endInterview({
      sessionId: opening.sessionId,
      version: opening.version,
    })
    if (response.session?.status !== "completed") throw new Error("Expected completion.")

    expect(response.session.completedQuestions).toEqual([])
    expect(response.session.progress.completedMainQuestions).toBe(0)
    expect(response.session.completionReason).toBe("userEndedEarly")
    expect(response.session.review).toEqual({
      status: "unavailable",
      reason: "insufficientAnswers",
    })
    const review = await getInterviewReview({ sessionId: response.session.sessionId })
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
      completedQuestions: [],
      progress: { completedMainQuestions: 0 },
      completionReason: "userEndedEarly",
      review: { status: "unavailable", reason: "insufficientAnswers" },
    })
    if (endedImmediately.session?.status !== "completed") throw new Error("Expected completion.")
    const review = await getInterviewReview({ sessionId: endedImmediately.session.sessionId })
    expect(review.status).toBe("unavailable")
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
      completedQuestions: [{ answer: { content: "已完成的第一题回答" } }],
      progress: { completedMainQuestions: 1 },
      completionReason: "userEndedEarly",
      review: { status: "partial" },
    })
    if (endedOnSecond.session?.status !== "completed") throw new Error("Expected completion.")
    const review = await getInterviewReview({ sessionId: endedOnSecond.session.sessionId })
    if (review.status !== "partial") throw new Error("Expected partial review.")
    expect(review.questionDetails).toHaveLength(2)
    expect(review.review.questionReviews).toHaveLength(1)
    expect(review.questionDetails[0]?.record.question.id).toBe(
      createInterviewAgentPlanMock("noFollowUps").questions[0]!.question.id,
    )
    expect(review.questionDetails[0]).toMatchObject({
      record: { status: "answered", answer: { content: "已完成的第一题回答" } },
      performance: { score: 84 },
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
    const plan = createInterviewAgentPlanMock("singleFollowUp")
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
      completedQuestions: [
        {},
        {
          answer: { content: "已回答的主问题" },
          followUps: [],
        },
      ],
      progress: { completedMainQuestions: 2 },
      completionReason: "userEndedEarly",
      review: { status: "partial" },
    })
    if (ended.session?.status !== "completed") throw new Error("Expected completion.")
    const review = await getInterviewReview({ sessionId: ended.session.sessionId })
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
      ended.session.completedQuestions.map(({ question }) => question.id),
    )
  })

  it("preserves answered and unanswered follow-ups in their original order", async () => {
    const plan = createInterviewAgentPlanMock("multipleFollowUps")
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
    expect(ended.session.completedQuestions[1]?.followUps).toMatchObject([
      {
        question: { id: plan.questions[1]!.followUps[0]!.id },
        answer: { content: "已完成的第一轮追问" },
      },
    ])
    expect(ended.session.completedQuestions[1]?.followUps).toHaveLength(1)

    const review = await getInterviewReview({ sessionId: ended.session.sessionId })
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
    expect(completed.review.status).toBe("complete")

    const review = await getInterviewReview({ sessionId: completed.sessionId })
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
    expect(review.questionDetails).toHaveLength(completed.completedQuestions.length)
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
    const review = await getInterviewReview({ sessionId: completed.sessionId })
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
    expect(ended.session.completedQuestions).toHaveLength(2)
    expect(ended.session.candidateQuestionExchanges).toHaveLength(1)
    expect(ended.session.completionReason).toBe("formalQuestionsCompleted")
    expect(ended.session.review.status).toBe("complete")

    const review = await getInterviewReview({ sessionId: ended.session.sessionId })
    if (review.status !== "complete") throw new Error("Expected complete review.")
    expect(review.questionDetails).toHaveLength(2)
    expect(review).toEqual(createInterviewReviewResponseMock(ended.session))
  })

  it("returns an immutable persisted learning snapshot for repeated review reads", async () => {
    const first = await startToFirstQuestion("singleFollowUp")
    const endedResponse = await endInterview({
      sessionId: first.sessionId,
      version: first.version,
    })
    if (endedResponse.session?.status !== "completed") throw new Error("Expected completion.")

    const firstRead = await getInterviewReview({ sessionId: endedResponse.session.sessionId })
    const original = structuredClone(firstRead)
    const firstReference = firstRead.questionDetails[0]?.referenceAnswer
    if (firstReference?.status !== "ready") throw new Error("Expected ready reference answer.")
    firstReference.content.exampleAnswer = "调用方修改后的内容"
    await startCurrentOpening()

    const secondRead = await getInterviewReview({ sessionId: endedResponse.session.sessionId })
    expect(secondRead).toEqual(original)
    expect(secondRead.questionDetails[0]?.referenceAnswer).not.toEqual(firstReference)
  })
})

describe("interview mock reset boundaries", () => {
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
      createInterviewAgentPlanMock("noFollowUps").questions[1]!.question.id,
    )
  })

  it("returns independent snapshots after every reset and request", async () => {
    const first = await getInterviewPage()
    first.setup.targetRoles[0]!.title = "被测试修改的岗位"
    first.setup.availableDurationMinutes.push(15)

    const second = await getInterviewPage()
    expect(second.setup.targetRoles[0]?.title).toBe("高级前端工程师")
    expect(second.setup.availableDurationMinutes).toEqual([15, 30, 45])

    resetScenario("adjustedPlan")
    const afterReset = await getInterviewPage()
    expect(afterReset.session).toBeNull()
    expect(afterReset.setup.targetRoles[0]?.title).toBe("高级前端工程师")
  })

  it("returns independent Agent plans for tests and Stories", () => {
    const first = createInterviewAgentPlanMock("multipleFollowUps")
    first.questions[1]!.question.prompt = "被测试修改的主问题"
    first.questions[1]!.followUps[0]!.prompt = "被测试修改的追问"

    const second = createInterviewAgentPlanMock("multipleFollowUps")
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

  it("keeps empty setup and prerequisite responses authoritative", async () => {
    resetInterviewMockState("noTargetRoles", { defaultDelayMs: 0 })
    const empty = await getInterviewPage()
    expect(empty.setup.targetRoles).toEqual([])
    expect(empty.session).toBeNull()

    resetInterviewMockState("prerequisiteNotMet", { defaultDelayMs: 0 })
    const blocked = await getInterviewPage()
    expect(blocked.setup.availability).toEqual({
      status: "blocked",
      reason: "profileIncomplete",
    })
    const targetRoleId = blocked.setup.defaultConfiguration.targetRoleId
    if (targetRoleId === null) throw new Error("Expected blocked target role.")
    await expect(
      startInterview({
        ...blocked.setup.defaultConfiguration,
        targetRoleId,
      }),
    ).rejects.toThrow("Interview prerequisite is not met: profileIncomplete.")
  })
})
