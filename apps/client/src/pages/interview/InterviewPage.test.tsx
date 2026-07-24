import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { createInterviewMockResponse } from "@/mocks/data/interview"
import type { InterviewPageResponse } from "@/models/interview"
import { getInterviewPage, startInterview } from "@/services/interview"
import { renderWithProviders } from "@/test/render"

import { InterviewPage } from "./InterviewPage"

vi.mock("@/services/interview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/interview")>()),
  getInterviewPage: vi.fn(),
  startInterview: vi.fn(),
}))

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function createStartedResponse(): InterviewPageResponse {
  const setupResponse = createInterviewMockResponse()
  return {
    setup: setupResponse.setup,
    session: {
      status: "opening",
      sessionId: "mock-interview-session-page",
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
    },
  }
}

function renderInterviewPage() {
  return renderWithProviders(<InterviewPage />, {
    router: { initialEntries: ["/interview"] },
  })
}

describe("InterviewPage", () => {
  beforeEach(() => {
    vi.mocked(getInterviewPage).mockReset()
    vi.mocked(startInterview).mockReset()
  })

  it("maps an initial request to the structured loading view", async () => {
    vi.mocked(getInterviewPage).mockReturnValue(new Promise(() => undefined))

    renderInterviewPage()

    expect(
      await screen.findByRole("heading", { name: i18n.t("interview.title") }),
    ).toBeInTheDocument()
    expect(screen.getByText(i18n.t("interview.setup.title"))).toBeInTheDocument()
    expect(screen.getByTestId("interview-loading-state")).toBeInTheDocument()
  })

  it("maps service setup data to the ready view", async () => {
    const response = createInterviewMockResponse()
    vi.mocked(getInterviewPage).mockResolvedValue(response)

    renderInterviewPage()

    expect(await screen.findByText("Senior Frontend Engineer · ByteDance")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("interview.rounds.technical") }),
    ).toBeInTheDocument()
  })

  it("maps an empty target-role response to the empty view", async () => {
    vi.mocked(getInterviewPage).mockResolvedValue(createInterviewMockResponse("noTargetRoles"))

    renderInterviewPage()

    expect(await screen.findByText(i18n.t("interview.empty.title"))).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })

  it("maps a service prerequisite to the matching existing completion route", async () => {
    vi.mocked(getInterviewPage).mockResolvedValue(createInterviewMockResponse("prerequisiteNotMet"))

    renderInterviewPage()

    expect(
      await screen.findByText(i18n.t("interview.prerequisites.profileIncomplete.title")),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: i18n.t("interview.prerequisites.profileIncomplete.action"),
      }),
    ).toHaveAttribute("href", "/profile")
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })

  it("shows a safe load error and retries", async () => {
    const user = userEvent.setup()
    vi.mocked(getInterviewPage)
      .mockRejectedValueOnce(new Error("unsafe request details"))
      .mockResolvedValueOnce(createInterviewMockResponse())

    renderInterviewPage()

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(i18n.t("interview.errors.loadTitle"))
    expect(alert).not.toHaveTextContent("unsafe request details")

    await user.click(screen.getByRole("button", { name: i18n.t("interview.actions.retry") }))
    expect(await screen.findByText("Senior Frontend Engineer · ByteDance")).toBeInTheDocument()
  })

  it("starts once, updates the query snapshot, and navigates to the session route", async () => {
    const user = userEvent.setup()
    const setup = createInterviewMockResponse()
    const started = createStartedResponse()
    vi.mocked(getInterviewPage).mockResolvedValue(setup)
    vi.mocked(startInterview).mockResolvedValue(started)
    const renderResult = renderInterviewPage()

    await user.click(await screen.findByRole("button", { name: i18n.t("interview.actions.start") }))

    await waitFor(() =>
      expect(renderResult.router?.state.location.pathname).toBe(
        "/interview/session/mock-interview-session-page",
      ),
    )
    expect(startInterview).toHaveBeenCalledOnce()
    expect(vi.mocked(startInterview).mock.calls[0]?.[0]).toEqual(setup.setup.defaultConfiguration)
    expect(renderResult.queryClient.getQueryData(["interview"])).toEqual(started)
  })

  it("prevents a duplicate start while the first mutation is pending", async () => {
    const user = userEvent.setup()
    const startRequest = createDeferred<InterviewPageResponse>()
    vi.mocked(getInterviewPage).mockResolvedValue(createInterviewMockResponse())
    vi.mocked(startInterview).mockReturnValue(startRequest.promise)
    const renderResult = renderInterviewPage()

    await user.click(await screen.findByRole("button", { name: i18n.t("interview.actions.start") }))
    const pendingButton = await screen.findByRole("button", {
      name: i18n.t("interview.actions.starting"),
    })
    expect(pendingButton).toBeDisabled()
    await user.click(pendingButton)
    expect(startInterview).toHaveBeenCalledOnce()

    await act(async () => {
      startRequest.resolve(createStartedResponse())
    })
    await waitFor(() =>
      expect(renderResult.router?.state.location.pathname).toContain("/interview/session/"),
    )
  })

  it("keeps the selected configuration retryable after start fails", async () => {
    const user = userEvent.setup()
    vi.mocked(getInterviewPage).mockResolvedValue(createInterviewMockResponse())
    vi.mocked(startInterview)
      .mockRejectedValueOnce(new Error("start failed"))
      .mockResolvedValueOnce(createStartedResponse())
    const renderResult = renderInterviewPage()

    await user.click(await screen.findByRole("button", { name: i18n.t("interview.actions.start") }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("interview.errors.startTitle"),
    )

    await user.click(screen.getByRole("button", { name: i18n.t("interview.actions.start") }))
    await waitFor(() =>
      expect(renderResult.router?.state.location.pathname).toContain("/interview/session/"),
    )
    expect(startInterview).toHaveBeenCalledTimes(2)
  })
})
