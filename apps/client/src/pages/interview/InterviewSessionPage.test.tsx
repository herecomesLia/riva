import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import {
  createCandidateQuestionExchange,
  createInterviewAgentPlanMock,
  createInterviewCompletedSessionMock,
  createInterviewMockResponse,
} from "@/mocks/data/interview"
import type {
  InterviewCandidateQuestionsSessionResponse,
  InterviewFollowUpSessionResponse,
  InterviewPageResponse,
  InterviewQuestionSessionResponse,
} from "@/models/interview"
import {
  beginInterviewQuestions,
  endInterview,
  finishInterview,
  getInterviewPage,
  submitCandidateQuestion,
  submitInterviewAnswer,
} from "@/services/interview"
import { renderWithProviders } from "@/test/render"

import { InterviewSessionContainer } from "./InterviewSessionPage"

vi.mock("@/services/interview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/interview")>()),
  beginInterviewQuestions: vi.fn(),
  endInterview: vi.fn(),
  finishInterview: vi.fn(),
  getInterviewPage: vi.fn(),
  submitCandidateQuestion: vi.fn(),
  submitInterviewAnswer: vi.fn(),
}))

const sessionId = "mock-interview-session-page"
const singleFollowUpPlan = createInterviewAgentPlanMock("singleFollowUp")

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function responseWithSession(session: InterviewPageResponse["session"]): InterviewPageResponse {
  return {
    setup: createInterviewMockResponse().setup,
    session,
  }
}

function completedResponse(
  activeSession: Exclude<InterviewPageResponse["session"], null>,
): InterviewPageResponse {
  const completed = createInterviewCompletedSessionMock({
    completionReason:
      activeSession.status === "candidateQuestions" ? "formalQuestionsCompleted" : "userEndedEarly",
    completedMainQuestions: activeSession.progress.completedMainQuestions,
  })
  return responseWithSession({
    ...completed,
    sessionId: activeSession.sessionId,
    version: activeSession.version + 1,
    configuration: activeSession.configuration,
    startedAt: activeSession.startedAt,
    progress: activeSession.progress,
  })
}

function openingResponse(): InterviewPageResponse {
  return responseWithSession({
    status: "opening",
    sessionId,
    version: 1,
    configuration: {
      targetRoleId: "role_frontend_bytedance",
      round: "technical",
      difficulty: "pressure",
      durationMinutes: 30,
    },
    startedAt: "2026-07-24T02:00:00.000Z",
    progress: {
      completedMainQuestions: 0,
      totalMainQuestions: 3,
      planRevision: 1,
    },
    completedQuestions: [],
    openingMessage: "欢迎参加本次模拟面试。",
  })
}

function questionSession(order: number, version: number): InterviewQuestionSessionResponse {
  const question = singleFollowUpPlan.questions[order - 1]!.question
  return {
    status: "question",
    sessionId,
    version,
    configuration: {
      targetRoleId: "role_frontend_bytedance",
      round: "technical",
      difficulty: "pressure",
      durationMinutes: 30,
    },
    startedAt: "2026-07-24T02:00:00.000Z",
    progress: {
      completedMainQuestions: order - 1,
      totalMainQuestions: 3,
      planRevision: 1,
    },
    completedQuestions: [],
    currentQuestion: { status: "awaitingAnswer", question, answer: null },
  }
}

function followUpSession(followUpIndex: number, version: number): InterviewFollowUpSessionResponse {
  const planned = createInterviewAgentPlanMock("multipleFollowUps").questions[1]!
  const currentFollowUp = planned.followUps[followUpIndex]!
  return {
    status: "followUp",
    sessionId,
    version,
    configuration: {
      targetRoleId: "role_frontend_bytedance",
      round: "technical",
      difficulty: "pressure",
      durationMinutes: 30,
    },
    startedAt: "2026-07-24T02:00:00.000Z",
    progress: {
      completedMainQuestions: 1,
      totalMainQuestions: 3,
      planRevision: 1,
    },
    completedQuestions: [],
    currentQuestion: {
      question: planned.question,
      answer: {
        id: "main-answer",
        content: "我通过真实用户监控定位长任务，并分阶段完成治理。",
        submittedAt: "2026-07-24T02:03:00.000Z",
      },
      answeredFollowUps: planned.followUps.slice(0, followUpIndex).map((question, index) => ({
        status: "answered",
        question,
        answer: {
          id: `follow-up-answer-${index}`,
          content: "我会通过灰度对照验证业务收益。",
          submittedAt: "2026-07-24T02:04:00.000Z",
        },
      })),
    },
    currentFollowUp: {
      status: "awaitingAnswer",
      question: currentFollowUp,
      answer: null,
    },
  }
}

function renderSession() {
  return renderWithProviders(<InterviewSessionContainer sessionId={sessionId} />, {
    router: { initialEntries: [`/interview/session/${sessionId}`] },
  })
}

function candidateSession(
  version: number,
  exchanges: InterviewCandidateQuestionsSessionResponse["exchanges"] = [],
): InterviewCandidateQuestionsSessionResponse {
  const completed = createInterviewMockResponse("completed").session
  if (completed?.status !== "completed") throw new Error("Expected completed fixture.")

  return {
    status: "candidateQuestions",
    sessionId,
    version,
    configuration: completed.configuration,
    startedAt: completed.startedAt,
    progress: completed.progress,
    completedQuestions: completed.completedQuestions,
    prompt: "正式提问已经结束。现在请你以候选人身份向面试官提问。",
    exchanges,
  }
}

describe("InterviewSessionContainer", () => {
  beforeEach(() => {
    vi.mocked(getInterviewPage).mockReset()
    vi.mocked(beginInterviewQuestions).mockReset()
    vi.mocked(endInterview).mockReset()
    vi.mocked(submitInterviewAnswer).mockReset()
    vi.mocked(submitCandidateQuestion).mockReset()
    vi.mocked(finishInterview).mockReset()
  })

  it("maps a pending session query to the structured loading view", async () => {
    vi.mocked(getInterviewPage).mockReturnValue(new Promise(() => undefined))
    renderSession()

    expect(await screen.findByTestId("interview-session-loading")).toHaveAttribute(
      "aria-busy",
      "true",
    )
  })

  it("maps a load error to retry and renders the recovered session", async () => {
    const user = userEvent.setup()
    vi.mocked(getInterviewPage)
      .mockRejectedValueOnce(new Error("session load failed"))
      .mockResolvedValueOnce(responseWithSession(questionSession(1, 2)))
    renderSession()

    expect(await screen.findByText(i18n.t("interview.session.errors.loadTitle"))).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("interview.actions.retry"),
      }),
    )

    expect(await screen.findByText(singleFollowUpPlan.questions[0]!.question.prompt)).toBeVisible()
    expect(getInterviewPage).toHaveBeenCalledTimes(2)
  })

  it("starts the question flow through the service and updates the cached snapshot", async () => {
    const user = userEvent.setup()
    const firstQuestion = responseWithSession(questionSession(1, 2))
    vi.mocked(getInterviewPage).mockResolvedValue(openingResponse())
    vi.mocked(beginInterviewQuestions).mockResolvedValue(firstQuestion)
    const result = renderSession()

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("interview.session.actions.begin"),
      }),
    )

    expect(vi.mocked(beginInterviewQuestions).mock.calls[0]?.[0]).toEqual({
      sessionId,
      version: 1,
    })
    expect(await screen.findByText(singleFollowUpPlan.questions[0]!.question.prompt)).toBeVisible()
    expect(result.queryClient.getQueryData(["interview"])).toEqual(firstQuestion)
  })

  it("submits an answer only once while its mutation is pending", async () => {
    const user = userEvent.setup()
    const answer = "我会先说明背景和目标，再突出个人决策、推动动作和量化结果。"
    const first = questionSession(1, 2)
    const second = responseWithSession(questionSession(2, 3))
    const submitRequest = createDeferred<InterviewPageResponse>()
    vi.mocked(getInterviewPage).mockResolvedValue(responseWithSession(first))
    vi.mocked(submitInterviewAnswer).mockReturnValue(submitRequest.promise)
    renderSession()

    await user.type(await screen.findByRole("textbox"), answer)
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("interview.session.answer.submit"),
      }),
    )
    const pendingButton = await screen.findByRole("button", {
      name: i18n.t("interview.session.answer.submitting"),
    })
    expect(pendingButton).toBeDisabled()
    await user.click(pendingButton)
    expect(submitInterviewAnswer).toHaveBeenCalledOnce()

    await act(async () => submitRequest.resolve(second))
    expect(
      await screen.findByText(questionSession(2, 3).currentQuestion.question.prompt),
    ).toBeVisible()
    expect(submitInterviewAnswer).toHaveBeenCalledOnce()
  })

  it("consumes the next session state returned by answer submission", async () => {
    const user = userEvent.setup()
    const answer = "我有五年前端开发经验，主要负责复杂业务的架构和性能治理。"
    const first = questionSession(1, 2)
    const second = questionSession(2, 3)
    vi.mocked(getInterviewPage).mockResolvedValue(responseWithSession(first))
    vi.mocked(submitInterviewAnswer).mockResolvedValue(responseWithSession(second))
    renderSession()

    await user.type(await screen.findByRole("textbox"), answer)
    await user.click(
      screen.getByRole("button", { name: i18n.t("interview.session.answer.submit") }),
    )

    await waitFor(() =>
      expect(screen.getByText(second.currentQuestion.question.prompt)).toBeVisible(),
    )
    expect(submitInterviewAnswer).toHaveBeenCalledOnce()
  })

  it("consumes a second consecutive follow-up returned by the service", async () => {
    const user = userEvent.setup()
    const firstFollowUp = followUpSession(0, 4)
    const secondFollowUp = followUpSession(1, 5)
    vi.mocked(getInterviewPage).mockResolvedValue(responseWithSession(firstFollowUp))
    vi.mocked(submitInterviewAnswer).mockResolvedValue(responseWithSession(secondFollowUp))
    renderSession()

    await user.type(await screen.findByRole("textbox"), "我会使用灰度分组做同期对照。")
    await user.click(
      screen.getByRole("button", { name: i18n.t("interview.session.answer.submit") }),
    )

    expect(await screen.findByText(secondFollowUp.currentFollowUp.question.prompt)).toBeVisible()
    expect(
      screen.getByText(secondFollowUp.currentQuestion.answeredFollowUps[0]!.answer.content),
    ).toBeVisible()
    expect(vi.mocked(submitInterviewAnswer).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        target: "followUp",
        followUpQuestionId: firstFollowUp.currentFollowUp.question.id,
      }),
    )
  })

  it("ends an unanswered main question once, caches the snapshot, and opens its review", async () => {
    const user = userEvent.setup()
    const active = questionSession(1, 2)
    const completed = completedResponse(active)
    vi.mocked(getInterviewPage).mockResolvedValue(responseWithSession(active))
    vi.mocked(endInterview).mockResolvedValue(completed)
    const result = renderSession()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("interview.session.actions.end") }),
    )
    expect(screen.getByText(i18n.t("interview.session.endDialog.description"))).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("interview.session.actions.confirmEnd"),
      }),
    )

    expect(endInterview).toHaveBeenCalledOnce()
    expect(vi.mocked(endInterview).mock.calls[0]?.[0]).toEqual({ sessionId, version: 2 })
    await waitFor(() =>
      expect(result.router?.state.location.pathname).toBe(`/interview/review/${sessionId}`),
    )
    expect(result.router?.state.location.pathname).not.toBe("/interview")
    expect(result.queryClient.getQueryData(["interview"])).toEqual(completed)
  })

  it("ends from the current follow-up version and opens the same review route", async () => {
    const user = userEvent.setup()
    const active = followUpSession(1, 5)
    const completed = completedResponse(active)
    vi.mocked(getInterviewPage).mockResolvedValue(responseWithSession(active))
    vi.mocked(endInterview).mockResolvedValue(completed)
    const result = renderSession()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("interview.session.actions.end") }),
    )
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("interview.session.actions.confirmEnd"),
      }),
    )

    expect(vi.mocked(endInterview).mock.calls[0]?.[0]).toEqual({ sessionId, version: 5 })
    await waitFor(() =>
      expect(result.router?.state.location.pathname).toBe(`/interview/review/${sessionId}`),
    )
    expect(result.queryClient.getQueryData(["interview"])).toEqual(completed)
  })

  it("locks repeated early-end confirmation while the request is pending", async () => {
    const user = userEvent.setup()
    const active = questionSession(1, 2)
    const completed = completedResponse(active)
    const request = createDeferred<InterviewPageResponse>()
    vi.mocked(getInterviewPage).mockResolvedValue(responseWithSession(active))
    vi.mocked(endInterview).mockReturnValue(request.promise)
    const result = renderSession()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("interview.session.actions.end") }),
    )
    const confirm = screen.getByRole("button", {
      name: i18n.t("interview.session.actions.confirmEnd"),
    })
    await user.click(confirm)
    expect(confirm).toBeDisabled()
    expect(screen.getByRole("textbox", { hidden: true })).toBeDisabled()
    await user.click(confirm)
    expect(endInterview).toHaveBeenCalledOnce()

    await act(async () => request.resolve(completed))
    await waitFor(() =>
      expect(result.router?.state.location.pathname).toBe(`/interview/review/${sessionId}`),
    )
    expect(endInterview).toHaveBeenCalledOnce()
  })

  it("keeps the active session and route when ending fails", async () => {
    const user = userEvent.setup()
    const activeResponse = responseWithSession(questionSession(1, 2))
    vi.mocked(getInterviewPage).mockResolvedValue(activeResponse)
    vi.mocked(endInterview).mockRejectedValue(new Error("end failed"))
    const result = renderSession()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("interview.session.actions.end") }),
    )
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("interview.session.actions.confirmEnd"),
      }),
    )

    expect(await screen.findByText(i18n.t("interview.session.errors.endTitle"))).toBeVisible()
    expect(result.router?.state.location.pathname).toBe(`/interview/session/${sessionId}`)
    expect(result.queryClient.getQueryData(["interview"])).toEqual(activeResponse)
    expect(
      result.queryClient.getQueryData<InterviewPageResponse>(["interview"])?.session,
    ).not.toMatchObject({
      status: "completed",
    })
  })

  it("locks opening interactions while ending and then navigates to its review", async () => {
    const user = userEvent.setup()
    const activeResponse = openingResponse()
    const active = activeResponse.session
    if (active === null) throw new Error("Expected opening session.")
    const completed = completedResponse(active)
    const request = createDeferred<InterviewPageResponse>()
    vi.mocked(getInterviewPage).mockResolvedValue(activeResponse)
    vi.mocked(endInterview).mockReturnValue(request.promise)
    const result = renderSession()

    await user.click(
      await screen.findByRole("button", { name: i18n.t("interview.session.actions.end") }),
    )
    const confirm = screen.getByRole("button", {
      name: i18n.t("interview.session.actions.confirmEnd"),
    })
    await user.click(confirm)

    expect(
      screen.getByRole("button", {
        name: i18n.t("interview.session.actions.begin"),
        hidden: true,
      }),
    ).toBeDisabled()
    expect(confirm).toBeDisabled()
    await user.click(confirm)
    expect(endInterview).toHaveBeenCalledOnce()
    expect(vi.mocked(endInterview).mock.calls[0]?.[0]).toEqual({ sessionId, version: 1 })

    await act(async () => request.resolve(completed))
    await waitFor(() =>
      expect(result.router?.state.location.pathname).toBe(`/interview/review/${sessionId}`),
    )
    expect(endInterview).toHaveBeenCalledOnce()
    expect(result.queryClient.getQueryData(["interview"])).toEqual(completed)
  })

  it("submits candidate questions, shows feedback, and finishes only once", async () => {
    const user = userEvent.setup()
    const question = "这个岗位入职六个月后的成功标准是什么？"
    const candidate = candidateSession(6)
    const exchange = createCandidateQuestionExchange(question, 1)
    const withExchange = candidateSession(7, [exchange])
    const completed = completedResponse(withExchange)
    if (completed.session?.status !== "completed") throw new Error("Expected completed session.")
    completed.session.candidateQuestionExchanges = [exchange]
    const finishRequest = createDeferred<InterviewPageResponse>()
    vi.mocked(getInterviewPage).mockResolvedValue(responseWithSession(candidate))
    vi.mocked(submitCandidateQuestion).mockResolvedValue(responseWithSession(withExchange))
    vi.mocked(finishInterview).mockReturnValue(finishRequest.promise)
    const result = renderSession()

    await user.type(
      await screen.findByRole("textbox", {
        name: i18n.t("interview.session.candidate.label"),
      }),
      question,
    )
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("interview.session.candidate.submit"),
      }),
    )

    expect(await screen.findByText(exchange.interviewerAnswer)).toBeVisible()
    expect(screen.getByText(exchange.feedback.summary)).toBeVisible()
    expect(screen.getByText(exchange.feedback.suggestedAlternatives[0]!)).toBeVisible()
    expect(screen.queryByText(/总分|overall score|82/i)).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: i18n.t("interview.session.candidate.finish"),
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("interview.session.candidate.confirmFinish"),
      }),
    )
    const pendingFinish = screen.getByRole("button", {
      name: i18n.t("interview.session.candidate.confirmFinish"),
    })
    expect(pendingFinish).toBeDisabled()
    await user.click(pendingFinish)
    expect(finishInterview).toHaveBeenCalledOnce()

    await act(async () => finishRequest.resolve(completed))
    await waitFor(() =>
      expect(result.router?.state.location.pathname).toBe(`/interview/review/${sessionId}`),
    )
    expect(result.queryClient.getQueryData(["interview"])).toEqual(completed)
    expect(completed.session.candidateQuestionExchanges).toEqual([exchange])
    expect(finishInterview).toHaveBeenCalledOnce()
  })

  it("offers a return path when the route does not match an active session", async () => {
    vi.mocked(getInterviewPage).mockResolvedValue(createInterviewMockResponse())
    renderSession()

    expect(
      await screen.findByText(i18n.t("interview.session.unavailable.missingTitle")),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: i18n.t("interview.session.actions.backToSetup"),
      }),
    ).toBeVisible()
  })
})
