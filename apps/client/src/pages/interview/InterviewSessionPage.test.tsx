import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { interviewFixture } from "@/mocks/fixtures/interview"
import {
  createInterviewPageStoryFixture,
  createInterviewSetupStoryFixture,
  createCandidateExchangeStoryFixture,
} from "./stories/interview-story-fixtures"
import type {
  InterviewSession,
  InterviewData,
  CompletedSession,
  QuestionSession,
  FollowUpSession,
  CandidateQuestionsSession,
} from "@/models/interview-workflow"
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function responseWithSession(session: InterviewData["session"]): InterviewData {
  return {
    setup: createInterviewSetupStoryFixture(),
    session,
  }
}

function completedResponse(active: Exclude<InterviewSession, CompletedSession>): CompletedSession {
  return {
    status: "completed",
    sessionId: active.sessionId,
    history: "history" in active ? active.history : [],
  }
}

const configuration = { ...interviewFixture.configuration, targetRoleId: "role_frontend_bytedance" }

function openingResponse(): InterviewData {
  return responseWithSession({
    status: "opening",
    sessionId,
    configuration,
    progress: { ...interviewFixture.progress },
    openingMessage: interviewFixture.openingMessage,
  })
}

function questionSession(order: number): QuestionSession {
  return {
    status: "question",
    sessionId,
    configuration,
    progress: {
      ...interviewFixture.progress,
      completedMainQuestions: order - 1,
      totalMainQuestions: 2,
    },
    history: [],
    prompt: {
      ...interviewFixture.question,
      questionOrder: order,
      content: order === 1 ? interviewFixture.question.content : "请进一步说明方案取舍。",
    },
  }
}

function followUpSession(index: number): FollowUpSession {
  return {
    status: "followUp",
    sessionId,
    configuration,
    progress: { ...interviewFixture.progress },
    history: [
      {
        kind: "question",
        questionOrder: 1,
        prompt: interviewFixture.question.content,
        answer: "我通过真实用户监控定位长任务，并分阶段完成治理。",
      },
      ...(index === 0
        ? []
        : [
            {
              kind: "followUp" as const,
              questionOrder: 1,
              prompt: interviewFixture.followUp.content,
              answer: "我会通过灰度对照验证业务收益。",
            },
          ]),
    ],
    prompt: {
      ...interviewFixture.followUp,
      content: index === 0 ? interviewFixture.followUp.content : "你如何调整不符合预期的方案？",
    },
  }
}

function renderSession() {
  return renderWithProviders(<InterviewSessionContainer sessionId={sessionId} />, {
    router: { initialEntries: [`/interview/session/${sessionId}`] },
  })
}

function candidateSession(
  exchanges: CandidateQuestionsSession["exchanges"] = [],
): CandidateQuestionsSession {
  return {
    status: "candidateQuestions",
    sessionId,
    configuration,
    progress: { ...interviewFixture.progress, completedMainQuestions: 1 },
    history: [],
    prompt: interviewFixture.candidate.prompt,
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
      .mockResolvedValueOnce(responseWithSession(questionSession(1)))
    renderSession()

    expect(await screen.findByText(i18n.t("interview.session.errors.loadTitle"))).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("interview.actions.retry"),
      }),
    )

    expect(await screen.findByText(interviewFixture.question.content)).toBeVisible()
    expect(getInterviewPage).toHaveBeenCalledTimes(2)
  })

  it("starts the question flow through the service and updates the cached snapshot", async () => {
    const user = userEvent.setup()
    const firstQuestion = responseWithSession(questionSession(1))
    vi.mocked(getInterviewPage).mockResolvedValue(openingResponse())
    vi.mocked(beginInterviewQuestions).mockResolvedValue(firstQuestion.session)
    const result = renderSession()

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("interview.session.actions.begin"),
      }),
    )

    expect(beginInterviewQuestions).toHaveBeenCalledOnce()
    expect(await screen.findByText(interviewFixture.question.content)).toBeVisible()
    expect(result.queryClient.getQueryData(["interview"])).toEqual(firstQuestion)
  })

  it("submits an answer only once while its mutation is pending", async () => {
    const user = userEvent.setup()
    const answer = "我会先说明背景和目标，再突出个人决策、推动动作和量化结果。"
    const first = questionSession(1)
    const second = responseWithSession(questionSession(2))
    const submitRequest = createDeferred<InterviewData["session"]>()
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

    await act(async () => submitRequest.resolve(second.session))
    expect(await screen.findByText(questionSession(2).prompt.content)).toBeVisible()
    expect(submitInterviewAnswer).toHaveBeenCalledOnce()
  })

  it("consumes the next session state returned by answer submission", async () => {
    const user = userEvent.setup()
    const answer = "我有五年前端开发经验，主要负责复杂业务的架构和性能治理。"
    const first = questionSession(1)
    const second = questionSession(2)
    vi.mocked(getInterviewPage).mockResolvedValue(responseWithSession(first))
    vi.mocked(submitInterviewAnswer).mockResolvedValue(second)
    renderSession()

    await user.type(await screen.findByRole("textbox"), answer)
    await user.click(
      screen.getByRole("button", { name: i18n.t("interview.session.answer.submit") }),
    )

    await waitFor(() => expect(screen.getByText(second.prompt.content)).toBeVisible())
    expect(submitInterviewAnswer).toHaveBeenCalledOnce()
  })

  it("consumes a second consecutive follow-up returned by the service", async () => {
    const user = userEvent.setup()
    const firstFollowUp = followUpSession(0)
    const secondFollowUp = followUpSession(1)
    vi.mocked(getInterviewPage).mockResolvedValue(responseWithSession(firstFollowUp))
    vi.mocked(submitInterviewAnswer).mockResolvedValue(secondFollowUp)
    renderSession()

    await user.type(await screen.findByRole("textbox"), "我会使用灰度分组做同期对照。")
    await user.click(
      screen.getByRole("button", { name: i18n.t("interview.session.answer.submit") }),
    )

    expect(await screen.findByText(secondFollowUp.prompt.content)).toBeVisible()
    expect(screen.getByText(secondFollowUp.history[1]!.answer)).toBeVisible()
    expect(vi.mocked(submitInterviewAnswer).mock.calls[0]?.[0]).toBe("我会使用灰度分组做同期对照。")
  })

  it("ends an unanswered main question once, caches its summary, and opens its review", async () => {
    const user = userEvent.setup()
    const active = questionSession(1)
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
    await waitFor(() =>
      expect(result.router?.state.location.pathname).toBe(`/interview/review/${sessionId}`),
    )
    expect(result.router?.state.location.pathname).not.toBe("/interview")
    expect(result.queryClient.getQueryData(["interview"])).toEqual(responseWithSession(completed))
  })

  it("ends from the current follow-up and opens the same review route", async () => {
    const user = userEvent.setup()
    const active = followUpSession(1)
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

    expect(endInterview).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(result.router?.state.location.pathname).toBe(`/interview/review/${sessionId}`),
    )
    expect(result.queryClient.getQueryData(["interview"])).toEqual(responseWithSession(completed))
  })

  it("locks repeated early-end confirmation while the request is pending", async () => {
    const user = userEvent.setup()
    const active = questionSession(1)
    const completed = completedResponse(active)
    const request = createDeferred<CompletedSession>()
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
    const activeResponse = responseWithSession(questionSession(1))
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
      result.queryClient.getQueryData<InterviewData>(["interview"])?.session,
    ).not.toMatchObject({
      status: "completed",
    })
  })

  it("locks opening interactions while ending and then navigates to its review", async () => {
    const user = userEvent.setup()
    const activeResponse = openingResponse()
    const active = activeResponse.session
    if (active?.status !== "opening") throw new Error("Expected opening session.")
    const completed = completedResponse(active)
    const request = createDeferred<CompletedSession>()
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

    await act(async () => request.resolve(completed))
    await waitFor(() =>
      expect(result.router?.state.location.pathname).toBe(`/interview/review/${sessionId}`),
    )
    expect(endInterview).toHaveBeenCalledOnce()
    expect(result.queryClient.getQueryData(["interview"])).toEqual(responseWithSession(completed))
  })

  it("submits candidate questions, shows feedback, and finishes only once", async () => {
    const user = userEvent.setup()
    const question = "这个岗位入职六个月后的成功标准是什么？"
    const candidate = candidateSession()
    const exchange = createCandidateExchangeStoryFixture(question)
    const withExchange = candidateSession([exchange])
    const completed = completedResponse(withExchange)
    const finishRequest = createDeferred<CompletedSession>()
    vi.mocked(getInterviewPage).mockResolvedValue(responseWithSession(candidate))
    vi.mocked(submitCandidateQuestion).mockResolvedValue(withExchange)
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
    expect(result.queryClient.getQueryData(["interview"])).toEqual(responseWithSession(completed))
    expect(finishInterview).toHaveBeenCalledOnce()
  })

  it("offers a return path when the route does not match an active session", async () => {
    vi.mocked(getInterviewPage).mockResolvedValue(createInterviewPageStoryFixture())
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
