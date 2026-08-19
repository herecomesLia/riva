import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import {
  createInterviewMockResponse,
  createInterviewSetupResponseMock,
} from "@/mocks/data/interview"
import { createProfileMockSnapshot } from "@/mocks/data/profile"
import { createRolesMockResponse } from "@/mocks/data/roles"
import type {
  InterviewConfiguration,
  InterviewPageResponse,
  InterviewQuestionResponse,
} from "@/models/interview"
import {
  getInterviewPage,
  prepareInterviewTrainingEntry,
  startInterview,
} from "@/services/interview"
import { renderWithProviders } from "@/test/render"

import { InterviewPage } from "./InterviewPage"

vi.mock("@/services/interview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/interview")>()),
  getInterviewPage: vi.fn(),
  prepareInterviewTrainingEntry: vi.fn(),
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

function createStartedResponse(
  configuration: InterviewConfiguration = {
    targetRoleId: "role_frontend_bytedance",
    round: "technical",
    difficulty: "pressure",
    durationMinutes: 30,
  },
): InterviewPageResponse {
  const setupResponse = createInterviewMockResponse()
  return {
    setup: setupResponse.setup,
    session: {
      status: "opening",
      sessionId: "mock-interview-session-page",
      language: "zh-CN",
      version: 1,
      configuration,
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

type ActiveSessionStatus = "opening" | "question" | "generatingTurn" | "generatingReview"

function createActiveSessionResponse(status: ActiveSessionStatus): InterviewPageResponse {
  const response = createStartedResponse()
  if (status === "opening") return response

  if (response.session === null || response.session.status !== "opening") {
    throw new Error("Expected an opening interview session fixture.")
  }

  const question: InterviewQuestionResponse = {
    id: "mock-interview-question-recovery",
    prompt: "Describe the evidence for your decision.",
    type: "projectDeepDive",
    assessedCapabilities: ["Evidence"],
    order: 1,
  }

  if (status === "question") {
    return {
      ...response,
      session: {
        ...response.session,
        status: "question",
        currentQuestion: {
          status: "awaitingAnswer",
          question,
          answer: null,
        },
      },
    }
  }

  if (status === "generatingTurn") {
    return {
      ...response,
      session: {
        ...response.session,
        status: "generatingTurn",
        generationStatus: "generating",
        currentQuestion: {
          question,
          answer: {
            id: "mock-interview-answer-recovery",
            content: "I owned the rollout and measured the outcome.",
            submittedAt: "2026-07-24T02:04:00.000Z",
          },
          answeredFollowUps: [],
        },
      },
    }
  }

  return {
    ...response,
    session: {
      ...response.session,
      status: "generatingReview",
      generationStatus: "generating",
      completionReason: "formalQuestionsCompleted",
      candidateQuestionExchanges: [],
    },
  }
}

function createMultipleReadyRolesResponse(): InterviewPageResponse {
  return {
    setup: createInterviewSetupResponseMock(
      createRolesMockResponse("multipleRolesReady"),
      createProfileMockSnapshot(),
    ),
    session: null,
  }
}

function renderInterviewPage(initialEntry = "/interview", initialEntries = [initialEntry]) {
  return renderWithProviders(<InterviewPage />, {
    router: { initialEntries },
  })
}

describe("InterviewPage", () => {
  beforeEach(() => {
    vi.mocked(getInterviewPage).mockReset()
    vi.mocked(prepareInterviewTrainingEntry).mockReset()
    vi.mocked(startInterview).mockReset()
  })

  it("prepares a fresh history setup from a completed session", async () => {
    const current = createInterviewMockResponse("completed")
    const prepared = createMultipleReadyRolesResponse()
    prepared.setup.defaultConfiguration = {
      targetRoleId: "role_product_manager_meituan",
      round: "hr",
      difficulty: "basic",
      durationMinutes: 45,
    }
    vi.mocked(getInterviewPage).mockResolvedValue(current)
    vi.mocked(prepareInterviewTrainingEntry).mockResolvedValue({
      page: prepared,
      resolution: {
        status: "available",
        configuration: prepared.setup.defaultConfiguration,
        adjustments: [],
      },
    })

    renderInterviewPage(
      "/interview?entry=history&targetRoleId=role_product_manager_meituan&round=hr&difficulty=basic&durationMinutes=45",
    )

    expect(await screen.findByText("Product Manager · Meituan")).toBeInTheDocument()
    expect(vi.mocked(prepareInterviewTrainingEntry).mock.calls[0]?.[0]).toEqual({
      targetRoleId: "role_product_manager_meituan",
      round: "hr",
      difficulty: "basic",
      durationMinutes: 45,
    })
    expect(screen.getByTestId("interview-target-role-trigger")).toHaveTextContent("Product Manager")
    expect(screen.getByRole("button", { name: i18n.t("interview.rounds.hr") })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(
      screen.getByRole("button", { name: i18n.t("interview.difficulty.basic") }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", {
        name: i18n.t("interview.setup.durationMinutes", { minutes: 45 }),
      }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it.each(["opening", "question", "generatingTurn", "generatingReview"] as const)(
    "recovers an active %s session without rendering setup",
    async (status) => {
      const active = createActiveSessionResponse(status)
      vi.mocked(getInterviewPage).mockResolvedValue(active)
      const renderResult = renderInterviewPage("/interview", ["/previous", "/interview"])

      await waitFor(() =>
        expect(renderResult.router?.state.location.pathname).toBe(
          "/interview/session/mock-interview-session-page",
        ),
      )

      expect(renderResult.router?.history.length).toBe(2)
      expect(startInterview).not.toHaveBeenCalled()
      expect(prepareInterviewTrainingEntry).not.toHaveBeenCalled()
      expect(screen.queryByTestId("interview-target-role-trigger")).not.toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: i18n.t("interview.actions.start") }),
      ).not.toBeInTheDocument()
    },
  )

  it.each(["history", "planner"] as const)(
    "prioritizes active session recovery over %s training entry preparation",
    async (entry) => {
      const active = createActiveSessionResponse("opening")
      vi.mocked(getInterviewPage).mockResolvedValue(active)

      const renderResult = renderInterviewPage(
        `/interview?entry=${entry}&targetRoleId=role_frontend_bytedance&round=technical&difficulty=pressure&durationMinutes=30`,
      )

      await waitFor(() =>
        expect(renderResult.router?.state.location.pathname).toBe(
          "/interview/session/mock-interview-session-page",
        ),
      )
      expect(prepareInterviewTrainingEntry).not.toHaveBeenCalled()
      expect(startInterview).not.toHaveBeenCalled()
    },
  )

  it("keeps a completed session on the normal setup page", async () => {
    vi.mocked(getInterviewPage).mockResolvedValue(createInterviewMockResponse("completed"))

    const renderResult = renderInterviewPage()

    expect(await screen.findByText("Senior Frontend Engineer · ByteDance")).toBeInTheDocument()
    expect(renderResult.router?.state.location.pathname).toBe("/interview")
    expect(prepareInterviewTrainingEntry).not.toHaveBeenCalled()
    expect(startInterview).not.toHaveBeenCalled()
  })

  it("requires confirmation and explains adjusted round, difficulty, and duration", async () => {
    const user = userEvent.setup()
    const current = createInterviewMockResponse("completed")
    const prepared = createMultipleReadyRolesResponse()
    prepared.setup.defaultConfiguration = {
      targetRoleId: "role_product_manager_meituan",
      round: "hr",
      difficulty: "basic",
      durationMinutes: 15,
    }
    vi.mocked(getInterviewPage).mockResolvedValue(current)
    vi.mocked(prepareInterviewTrainingEntry).mockResolvedValue({
      page: prepared,
      resolution: {
        status: "adjusted",
        configuration: prepared.setup.defaultConfiguration,
        adjustments: ["interviewRoundUnsupported", "difficultyUnavailable", "durationUnavailable"],
      },
    })
    vi.mocked(startInterview).mockImplementation(async (input) => createStartedResponse(input))

    renderInterviewPage(
      "/interview?entry=history&targetRoleId=role_product_manager_meituan&round=technical&difficulty=pressure&durationMinutes=45",
    )

    const alert = await screen.findByTestId("history-entry-adjusted")
    expect(alert).toHaveTextContent(
      i18n.t("common.trainingEntry.adjustments.interviewRoundUnsupported"),
    )
    expect(alert).toHaveTextContent(
      i18n.t("common.trainingEntry.adjustments.difficultyUnavailable"),
    )
    expect(alert).toHaveTextContent(i18n.t("common.trainingEntry.adjustments.durationUnavailable"))
    const start = screen.getByRole("button", { name: i18n.t("interview.actions.start") })
    expect(start).toBeDisabled()
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("common.trainingEntry.adjusted.confirm"),
      }),
    )
    expect(start).toBeEnabled()
    await user.click(start)
    expect(vi.mocked(startInterview).mock.calls[0]?.[0]).toEqual(
      prepared.setup.defaultConfiguration,
    )
  })

  it("requires an explicit role choice when the historical interview role is unavailable", async () => {
    const user = userEvent.setup()
    const current = createInterviewMockResponse("completed")
    const prepared = createMultipleReadyRolesResponse()
    prepared.setup.defaultConfiguration.targetRoleId = null
    vi.mocked(getInterviewPage).mockResolvedValue(current)
    vi.mocked(prepareInterviewTrainingEntry).mockResolvedValue({
      page: prepared,
      resolution: {
        status: "roleUnavailable",
        reason: "targetRoleArchived",
        configuration: prepared.setup.defaultConfiguration,
      },
    })
    vi.mocked(startInterview).mockImplementation(async (input) => createStartedResponse(input))

    renderInterviewPage(
      "/interview?entry=history&targetRoleId=role_archived&round=technical&difficulty=basic&durationMinutes=30",
    )

    expect(await screen.findByTestId("history-entry-role-unavailable")).toHaveTextContent(
      i18n.t("common.trainingEntry.roleUnavailable.reasons.targetRoleArchived"),
    )
    const start = screen.getByRole("button", { name: i18n.t("interview.actions.start") })
    expect(start).toBeDisabled()
    expect(screen.getByTestId("interview-target-role-trigger")).toHaveTextContent(
      i18n.t("common.trainingEntry.selectRole"),
    )
    await user.click(screen.getByTestId("interview-target-role-trigger"))
    await user.click(await screen.findByRole("option", { name: /ByteDance/ }))
    expect(start).toBeEnabled()
    await user.click(start)
    expect(vi.mocked(startInterview).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ targetRoleId: "role_frontend_bytedance" }),
    )
  })

  it("shows a dedicated history-entry preparation failure and retries", async () => {
    const user = userEvent.setup()
    const current = createInterviewMockResponse("completed")
    const prepared = createMultipleReadyRolesResponse()
    vi.mocked(getInterviewPage).mockResolvedValue(current)
    vi.mocked(prepareInterviewTrainingEntry)
      .mockRejectedValueOnce(new Error("prepare failed"))
      .mockResolvedValueOnce({
        page: prepared,
        resolution: {
          status: "available",
          configuration: prepared.setup.defaultConfiguration,
          adjustments: [],
        },
      })

    renderInterviewPage(
      "/interview?entry=history&targetRoleId=role_frontend_bytedance&round=technical",
    )
    expect(await screen.findByTestId("history-entry-failed")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: i18n.t("common.trainingEntry.failed.retry") }),
    )
    expect(await screen.findByTestId("history-entry-available")).toBeInTheDocument()
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

  it("keeps the normal setup page when session is null", async () => {
    const response = createInterviewMockResponse()
    vi.mocked(getInterviewPage).mockResolvedValue(response)

    const renderResult = renderInterviewPage()

    expect(await screen.findByText("Senior Frontend Engineer · ByteDance")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("interview.rounds.technical") }),
    ).toBeInTheDocument()
    expect(renderResult.router?.state.location.pathname).toBe("/interview")
    expect(prepareInterviewTrainingEntry).not.toHaveBeenCalled()
    expect(startInterview).not.toHaveBeenCalled()
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

  it("maps roles without ready job descriptions to the existing blocked state", async () => {
    const response: InterviewPageResponse = {
      setup: createInterviewSetupResponseMock(
        createRolesMockResponse("multipleRolesJdMissing"),
        createProfileMockSnapshot(),
      ),
      session: null,
    }
    vi.mocked(getInterviewPage).mockResolvedValue(response)

    renderInterviewPage()

    expect(
      await screen.findByText(i18n.t("interview.prerequisites.jobDescriptionMissing.title")),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: i18n.t("interview.actions.start") })).toBeNull()
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

  it("submits a non-default product HR/basic configuration", async () => {
    const user = userEvent.setup()
    const setup = createMultipleReadyRolesResponse()
    vi.mocked(getInterviewPage).mockResolvedValue(setup)
    vi.mocked(startInterview).mockImplementation(async (input) => createStartedResponse(input))
    renderInterviewPage()

    await user.click(await screen.findByTestId("interview-target-role-trigger"))
    await user.click(await screen.findByRole("option", { name: "Product Manager · Meituan" }))
    await user.click(screen.getByRole("button", { name: i18n.t("interview.difficulty.basic") }))
    await user.click(screen.getByRole("button", { name: i18n.t("interview.actions.start") }))

    expect(vi.mocked(startInterview).mock.calls[0]?.[0]).toEqual({
      targetRoleId: "role_product_manager_meituan",
      round: "hr",
      difficulty: "basic",
      durationMinutes: 30,
    })
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
