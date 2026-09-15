import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import {
  createInterviewPageStoryFixture,
  createInterviewSetupStoryFixture,
} from "./stories/interview-story-fixtures"
import type { InterviewConfiguration, InterviewData } from "@/models/interview-workflow"
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
    roleId: "role_frontend_bytedance",
    interviewType: "professional",
    difficulty: "pressure",
    durationMinutes: 30,
  },
): InterviewData {
  const setupResponse = createInterviewPageStoryFixture()
  return {
    setup: setupResponse.setup,
    session: {
      status: "opening",
      sessionId: "mock-interview-session-page",
      configuration,
      progress: {
        completedMainQuestions: 0,
        totalMainQuestions: 3,
        planAdjusted: false,
      },
      openingMessage: "欢迎参加本次模拟面试。",
    },
  }
}

function createMultipleReadyRolesResponse(): InterviewData {
  return {
    setup: createInterviewSetupStoryFixture("multipleRolesReady"),
    session: null,
  }
}

function renderInterviewPage(initialEntry = "/interview") {
  return renderWithProviders(<InterviewPage />, {
    router: { initialEntries: [initialEntry] },
  })
}

describe("InterviewPage", () => {
  beforeEach(() => {
    vi.mocked(getInterviewPage).mockReset()
    vi.mocked(prepareInterviewTrainingEntry).mockReset()
    vi.mocked(startInterview).mockReset()
  })

  it.each(["active", "completed"] as const)(
    "prepares a fresh history setup from an existing %s session",
    async (sessionState) => {
      const current =
        sessionState === "active"
          ? createStartedResponse()
          : createInterviewPageStoryFixture("completed")
      const prepared = createMultipleReadyRolesResponse()
      prepared.setup.defaultConfiguration = {
        roleId: "role_product_manager_meituan",
        interviewType: "hr",
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
        "/interview?entry=history&roleId=role_product_manager_meituan&interviewType=hr&difficulty=basic&durationMinutes=45",
      )

      expect(await screen.findByText("Product Manager · Meituan")).toBeInTheDocument()
      expect(vi.mocked(prepareInterviewTrainingEntry).mock.calls[0]?.[0]).toEqual({
        roleId: "role_product_manager_meituan",
        interviewType: "hr",
        difficulty: "basic",
        durationMinutes: 45,
      })
      expect(screen.getByTestId("interview-role-trigger")).toHaveTextContent("Product Manager")
      expect(screen.getByRole("button", { name: i18n.t("interview.types.hr") })).toHaveAttribute(
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
    },
  )

  it("requires confirmation and explains adjusted interviewType, difficulty, and duration", async () => {
    const user = userEvent.setup()
    const current = createStartedResponse()
    const prepared = createMultipleReadyRolesResponse()
    prepared.setup.defaultConfiguration = {
      roleId: "role_product_manager_meituan",
      interviewType: "hr",
      difficulty: "basic",
      durationMinutes: 15,
    }
    vi.mocked(getInterviewPage).mockResolvedValue(current)
    vi.mocked(prepareInterviewTrainingEntry).mockResolvedValue({
      page: prepared,
      resolution: {
        status: "adjusted",
        configuration: prepared.setup.defaultConfiguration,
        adjustments: ["interviewTypeUnsupported", "difficultyUnavailable", "durationUnavailable"],
      },
    })
    vi.mocked(startInterview).mockImplementation(
      async (input) => createStartedResponse(input).session,
    )

    renderInterviewPage(
      "/interview?entry=history&roleId=role_product_manager_meituan&interviewType=professional&difficulty=pressure&durationMinutes=45",
    )

    const alert = await screen.findByTestId("history-entry-adjusted")
    expect(alert).toHaveTextContent(
      i18n.t("common.trainingEntry.adjustments.interviewTypeUnsupported"),
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
    const current = createInterviewPageStoryFixture("completed")
    const prepared = createMultipleReadyRolesResponse()
    prepared.setup.defaultConfiguration.roleId = null
    vi.mocked(getInterviewPage).mockResolvedValue(current)
    vi.mocked(prepareInterviewTrainingEntry).mockResolvedValue({
      page: prepared,
      resolution: {
        status: "roleUnavailable",
        reason: "roleArchived",
        configuration: prepared.setup.defaultConfiguration,
      },
    })
    vi.mocked(startInterview).mockImplementation(
      async (input) => createStartedResponse(input).session,
    )

    renderInterviewPage(
      "/interview?entry=history&roleId=role_archived&interviewType=professional&difficulty=basic&durationMinutes=30",
    )

    expect(await screen.findByTestId("history-entry-role-unavailable")).toHaveTextContent(
      i18n.t("common.trainingEntry.roleUnavailable.reasons.roleArchived"),
    )
    const start = screen.getByRole("button", { name: i18n.t("interview.actions.start") })
    expect(start).toBeDisabled()
    expect(screen.getByTestId("interview-role-trigger")).toHaveTextContent(
      i18n.t("common.trainingEntry.selectRole"),
    )
    await user.click(screen.getByTestId("interview-role-trigger"))
    await user.click(await screen.findByRole("option", { name: /ByteDance/ }))
    expect(start).toBeEnabled()
    await user.click(start)
    expect(vi.mocked(startInterview).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ roleId: "role_frontend_bytedance" }),
    )
  })

  it("shows a dedicated history-entry preparation failure and retries", async () => {
    const user = userEvent.setup()
    const current = createInterviewPageStoryFixture("completed")
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
      "/interview?entry=history&roleId=role_frontend_bytedance&interviewType=professional",
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

  it("maps service setup data to the ready view", async () => {
    const response = createInterviewPageStoryFixture()
    vi.mocked(getInterviewPage).mockResolvedValue(response)

    renderInterviewPage()

    expect(await screen.findByText("Senior Frontend Engineer · ByteDance")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("interview.types.professional") }),
    ).toBeInTheDocument()
    expect(prepareInterviewTrainingEntry).not.toHaveBeenCalled()
  })

  it("maps an empty role response to the empty view", async () => {
    vi.mocked(getInterviewPage).mockResolvedValue(createInterviewPageStoryFixture("noRoles"))

    renderInterviewPage()

    expect(await screen.findByText(i18n.t("interview.empty.title"))).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })

  it("maps a service prerequisite to the matching existing completion route", async () => {
    vi.mocked(getInterviewPage).mockResolvedValue(
      createInterviewPageStoryFixture("prerequisiteNotMet"),
    )

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
    const response: InterviewData = {
      setup: createInterviewSetupStoryFixture("jobDescriptionMissing"),
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
      .mockResolvedValueOnce(createInterviewPageStoryFixture())

    renderInterviewPage()

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(i18n.t("interview.errors.loadTitle"))
    expect(alert).not.toHaveTextContent("unsafe request details")

    await user.click(screen.getByRole("button", { name: i18n.t("interview.actions.retry") }))
    expect(await screen.findByText("Senior Frontend Engineer · ByteDance")).toBeInTheDocument()
  })

  it("starts once, updates the query snapshot, and navigates to the session route", async () => {
    const user = userEvent.setup()
    const setup = createInterviewPageStoryFixture()
    const started = createStartedResponse()
    vi.mocked(getInterviewPage).mockResolvedValue(setup)
    vi.mocked(startInterview).mockResolvedValue(started.session)
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
    vi.mocked(startInterview).mockImplementation(
      async (input) => createStartedResponse(input).session,
    )
    renderInterviewPage()

    await user.click(await screen.findByTestId("interview-role-trigger"))
    await user.click(await screen.findByRole("option", { name: "Product Manager · Meituan" }))
    await user.click(screen.getByRole("button", { name: i18n.t("interview.types.hr") }))
    await user.click(screen.getByRole("button", { name: i18n.t("interview.difficulty.basic") }))
    await user.click(screen.getByRole("button", { name: i18n.t("interview.actions.start") }))

    expect(vi.mocked(startInterview).mock.calls[0]?.[0]).toEqual({
      roleId: "role_product_manager_meituan",
      interviewType: "hr",
      difficulty: "basic",
      durationMinutes: 30,
    })
  })

  it("prevents a duplicate start while the first mutation is pending", async () => {
    const user = userEvent.setup()
    const startRequest = createDeferred<InterviewData["session"]>()
    vi.mocked(getInterviewPage).mockResolvedValue(createInterviewPageStoryFixture())
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
      startRequest.resolve(createStartedResponse().session)
    })
    await waitFor(() =>
      expect(renderResult.router?.state.location.pathname).toContain("/interview/session/"),
    )
  })

  it("keeps the selected configuration retryable after start fails", async () => {
    const user = userEvent.setup()
    vi.mocked(getInterviewPage).mockResolvedValue(createInterviewPageStoryFixture())
    vi.mocked(startInterview)
      .mockRejectedValueOnce(new Error("start failed"))
      .mockResolvedValueOnce(createStartedResponse().session)
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
