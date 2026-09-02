import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import { resetInterviewMockState } from "@/mocks/services/interview"
import { resetPracticeMockState } from "@/mocks/services/practice"
import { resetRolesMockState } from "@/mocks/services/roles"
import { resetTrainingRecordsMockState } from "@/mocks/services/training-records"
import {
  beginInterviewQuestions,
  endInterview,
  finishInterview,
  getInterviewPage,
  getInterviewReview,
  startInterview,
  submitInterviewAnswer,
} from "@/services/interview"
import { getDashboardData } from "@/services/dashboard"
import { endPracticeSession, getPracticePage, requestEndPracticeSession } from "@/services/practice"
import { getProfile } from "@/services/profile"
import { getRolesPage, updateTargetRole } from "@/services/roles"
import {
  getMockInterviewRecord,
  getTargetedPracticeRecord,
  getTrainingRecordsOverview,
  listTrainingRecords,
} from "@/services/training-records"

vi.mock("@/services/profile", () => ({ getProfile: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  resetRolesMockState()
  vi.mocked(getProfile).mockResolvedValue(structuredClone(careerProfileFixture))
  resetInterviewMockState("setupReady", {
    agentScenario: "noFollowUps",
    defaultDelayMs: 0,
  })
  resetPracticeMockState("reviewBalanced", { defaultDelayMs: 0 })
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return promise
}

async function completePractice() {
  const current = await settle(getPracticePage())
  if (current.session.status !== "review") throw new Error("Expected practice review state.")
  const response = await endPracticeSession({
    sessionId: current.session.sessionId,
    version: current.session.version,
  })
  if (response.session.status !== "completed") throw new Error("Expected practice completion.")
  return { ...response, session: response.session }
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
  it("adds a completed practice record to history list, overview, and detail", async () => {
    const dashboardBefore = await settle(getDashboardData())
    const completed = await completePractice()
    const recordId = `targeted-practice-record-${completed.session.sessionId}`

    const overview = await settle(getTrainingRecordsOverview())
    const page = await settle(
      listTrainingRecords({ kinds: ["targetedPractice"], page: 1, pageSize: 20 }),
    )
    const detail = await settle(getTargetedPracticeRecord(recordId))
    const dashboard = await settle(getDashboardData())

    expect(overview).toMatchObject({
      totalRecordCount: 7,
      completedRecordCount: 3,
      byKind: { targetedPractice: { recordCount: 4, completedRecordCount: 2 } },
    })
    expect(page.items).toContainEqual(
      expect.objectContaining({ id: recordId, kind: "targetedPractice", status: "completed" }),
    )
    expect(detail).toMatchObject({
      id: recordId,
      setup: {
        questionType: completed.session.selection.questionType,
        difficulty: completed.session.selection.difficulty,
        source: completed.session.selection.source,
        prioritizedWeaknesses: completed.session.selection.prioritizeWeaknesses,
      },
      answeredQuestionCount: 1,
      totalQuestionCount: 1,
      questions: [
        {
          answer: expect.objectContaining({ content: expect.any(String) }),
          evaluation: expect.objectContaining({ overallScore: expect.any(Number) }),
          review: expect.objectContaining({ summary: expect.any(String) }),
          referenceAnswer: { status: "ready", content: expect.any(Object) },
        },
      ],
    })
    expect(dashboard.performanceTrend.targetedPractice).toContainEqual({
      id: detail.id,
      occurredAt: detail.endedAt,
      score: detail.overallScore,
    })
    expect(dashboard.metrics.practiceTimeMinutes.currentValue).toBe(
      Math.round((900 + detail.durationSeconds) / 60),
    )
    expect(dashboard.performanceTrend.targetedPractice).toHaveLength(
      dashboardBefore.performanceTrend.targetedPractice.length + 1,
    )
    expect(dashboard.metrics.practiceTimeMinutes.currentValue).toBeGreaterThan(
      dashboardBefore.metrics.practiceTimeMinutes.currentValue ?? 0,
    )
  })

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

  it("removes newly generated records when the training-record mock is reset", async () => {
    const completed = await completePractice()
    const recordId = `targeted-practice-record-${completed.session.sessionId}`
    await expect(settle(getTargetedPracticeRecord(recordId))).resolves.toBeDefined()

    resetTrainingRecordsMockState()

    const missing = getTargetedPracticeRecord(recordId)
    const assertion = expect(missing).rejects.toMatchObject({
      code: "trainingRecordNotFound",
      recordId,
    })
    await vi.runAllTimersAsync()
    await assertion
  })

  it("stores a deep history snapshot independent from later runtime mutation", async () => {
    const completed = await completePractice()
    const recordId = `targeted-practice-record-${completed.session.sessionId}`
    const firstRecord = completed.session.attemptRecords[0]
    if (firstRecord === undefined) throw new Error("Expected a completed attempt.")

    firstRecord.question.prompt = "后来修改的运行态问题"
    firstRecord.mainAnswer.content = "后来修改的运行态回答"
    firstRecord.review.overallPerformance = "后来修改的运行态复盘"

    const detail = await settle(getTargetedPracticeRecord(recordId))
    expect(detail.questions[0]?.prompt).not.toBe("后来修改的运行态问题")
    expect(detail.questions[0]?.answer?.content).not.toBe("后来修改的运行态回答")
    expect(detail.questions[0]?.review?.summary).not.toBe("后来修改的运行态复盘")
  })

  it("keeps the role title and company snapshot after the linked Roles entity is edited", async () => {
    const completed = await completePractice()
    const recordId = `targeted-practice-record-${completed.session.sessionId}`
    const before = await settle(getTargetedPracticeRecord(recordId))
    const roles = await settle(getRolesPage())
    const role = roles.roles.find(({ id }) => id === before.targetRole.id)
    if (!role) throw new Error("Expected the history role in the Roles domain.")

    await settle(
      updateTargetRole({
        roleId: role.id,
        version: role.version,
        title: "Edited after training",
        company: "Edited Company",
        recruitmentType: role.recruitmentType,
        location: role.location,
        experienceRange: role.experienceRange,
      }),
    )

    const after = await settle(getTargetedPracticeRecord(recordId))
    expect(after.targetRole).toEqual(before.targetRole)
    expect(after.targetRole.id).toBe(role.id)
    expect(after.targetRole.title).not.toBe("Edited after training")
    expect(after.targetRole.company).not.toBe("Edited Company")
  })

  it("creates semantic partial and zero-answer practice snapshots", async () => {
    resetPracticeMockState("reviewFollowUpEndedEarly", { defaultDelayMs: 0 })
    const partial = await completePractice()
    const partialDetail = await settle(
      getTargetedPracticeRecord(`targeted-practice-record-${partial.session.sessionId}`),
    )
    expect(partialDetail).toMatchObject({
      status: "partiallyCompleted",
      answeredQuestionCount: 1,
      questions: [{ followUps: [expect.any(Object), { answer: null }] }],
    })

    resetPracticeMockState("answeringQuestion", { defaultDelayMs: 0 })
    const current = await settle(getPracticePage())
    if (current.session.status !== "answering") throw new Error("Expected answering state.")
    const ended = await requestEndPracticeSession({
      sessionId: current.session.sessionId,
      version: current.session.version,
      questionId: current.session.question.id,
    })
    if (ended.session.status !== "completed") throw new Error("Expected completion.")
    const zeroDetail = await settle(
      getTargetedPracticeRecord(`targeted-practice-record-${ended.session.sessionId}`),
    )
    expect(zeroDetail).toMatchObject({
      status: "endedEarly",
      answeredQuestionCount: 0,
      totalQuestionCount: 1,
      overallScore: null,
      questions: [{ answer: null, isSaved: false, isMarkedWeak: false }],
      recommendation: { action: "none" },
    })
  })
})
