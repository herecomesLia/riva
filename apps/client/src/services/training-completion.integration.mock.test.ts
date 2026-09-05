import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import { resetInterviewMockState } from "@/mocks/services/interview"
import { resetRolesMockState } from "@/mocks/services/roles"
import {
  beginInterviewQuestions,
  endInterview,
  finishInterview,
  getInterviewPage,
  getInterviewReview,
  startInterview,
  submitInterviewAnswer,
} from "@/services/interview"
import { getProfile } from "@/services/profile"
import { getMockInterviewRecord, listTrainingRecords } from "@/services/training-records"

vi.mock("@/services/profile", () => ({ getProfile: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  resetRolesMockState()
  vi.mocked(getProfile).mockResolvedValue(structuredClone(careerProfileFixture))
  resetInterviewMockState("setupReady", {
    agentScenario: "noFollowUps",
    defaultDelayMs: 0,
  })
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return promise
}

async function startInterviewAtFirstQuestion() {
  const page = await getInterviewPage()
  const targetRoleId = page.setup.defaultConfiguration.targetRoleId
  if (targetRoleId === null) throw new Error("Expected a default interview role.")
  const opening = await startInterview({
    ...page.setup.defaultConfiguration,
    targetRoleId,
  })
  if (opening.session?.status !== "opening") throw new Error("Expected interview opening.")
  const response = await beginInterviewQuestions({
    sessionId: opening.session.sessionId,
    version: opening.session.version,
  })
  if (response.session?.status !== "question") throw new Error("Expected interview question.")
  return response.session
}

async function publishInterviewReview(sessionId: string) {
  const first = await getInterviewReview({ sessionId })
  const result = first.status === "generating" ? await getInterviewReview({ sessionId }) : first
  if (result.status === "generating") throw new Error("Expected terminal interview review.")
  return result
}

describe("training completion to history mock integration", () => {
  it("keeps the unanswered question when an interview ends early", async () => {
    const question = await startInterviewAtFirstQuestion()
    const completed = await endInterview({
      sessionId: question.sessionId,
      version: question.version,
    })
    if (completed.session?.status !== "completed") throw new Error("Expected completion.")
    await publishInterviewReview(completed.session.sessionId)

    const detail = await settle(
      getMockInterviewRecord(`mock-interview-record-${completed.session.sessionId}`),
    )
    expect(detail).toMatchObject({
      status: "endedEarly",
      completionReason: "userEndedEarly",
      answeredQuestionCount: 0,
      totalQuestionCount: 1,
      overallScore: null,
      overallReview: { status: "unavailable", reason: "insufficientAnswers" },
      questions: [
        {
          id: question.currentQuestion.question.id,
          answer: null,
          evaluation: null,
          review: null,
        },
      ],
    })
  })

  it("creates a partial interview record from answered and unanswered questions", async () => {
    const first = await startInterviewAtFirstQuestion()
    const next = await submitInterviewAnswer({
      target: "question",
      sessionId: first.sessionId,
      version: first.version,
      questionId: first.currentQuestion.question.id,
      content: "已完成的第一道主问题回答",
    })
    if (next.session?.status !== "question") throw new Error("Expected second question.")
    const completed = await endInterview({
      sessionId: next.session.sessionId,
      version: next.session.version,
    })
    if (completed.session?.status !== "completed") throw new Error("Expected completion.")
    const recordId = `mock-interview-record-${completed.session.sessionId}`
    const beforeReview = await settle(
      listTrainingRecords({ kinds: ["mockInterview"], page: 1, pageSize: 20 }),
    )
    expect(beforeReview.items.some(({ id }) => id === recordId)).toBe(false)
    await publishInterviewReview(completed.session.sessionId)

    const detail = await settle(getMockInterviewRecord(recordId))
    expect(detail).toMatchObject({
      status: "partiallyCompleted",
      answeredQuestionCount: 1,
      totalQuestionCount: 2,
      overallScore: null,
      overallReview: { status: "partial" },
      questions: [
        { answer: { content: "已完成的第一道主问题回答" } },
        { answer: null, evaluation: null, review: null },
      ],
    })
  })

  it("creates a complete interview record after formal questions finish", async () => {
    const first = await startInterviewAtFirstQuestion()
    const second = await submitInterviewAnswer({
      target: "question",
      sessionId: first.sessionId,
      version: first.version,
      questionId: first.currentQuestion.question.id,
      content: "第一道主问题回答",
    })
    if (second.session?.status !== "question") throw new Error("Expected second question.")
    const candidateQuestions = await submitInterviewAnswer({
      target: "question",
      sessionId: second.session.sessionId,
      version: second.session.version,
      questionId: second.session.currentQuestion.question.id,
      content: "第二道主问题回答",
    })
    if (candidateQuestions.session?.status !== "candidateQuestions") {
      throw new Error("Expected candidate questions.")
    }
    const completed = await finishInterview({
      sessionId: candidateQuestions.session.sessionId,
      version: candidateQuestions.session.version,
    })
    if (completed.session?.status !== "completed") throw new Error("Expected completion.")
    await publishInterviewReview(completed.session.sessionId)

    const detail = await settle(
      getMockInterviewRecord(`mock-interview-record-${completed.session.sessionId}`),
    )
    expect(detail).toMatchObject({
      status: "completed",
      completionReason: "formalQuestionsCompleted",
      answeredQuestionCount: 2,
      totalQuestionCount: 2,
      overallScore: expect.any(Number),
      overallReview: { status: "complete" },
      recommendation: { action: "targetedPractice" },
    })
  })

  it("does not duplicate history when the same end request is repeated", async () => {
    const question = await startInterviewAtFirstQuestion()
    const input = { sessionId: question.sessionId, version: question.version }
    await endInterview(input)
    await expect(endInterview(input)).rejects.toThrow("Interview session is not active.")

    const page = await settle(
      listTrainingRecords({ kinds: ["mockInterview"], page: 1, pageSize: 20 }),
    )
    expect(
      page.items.filter(({ id }) => id === `mock-interview-record-${question.sessionId}`),
    ).toHaveLength(1)
  })
})
