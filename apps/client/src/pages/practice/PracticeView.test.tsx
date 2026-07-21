import { act, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createPracticeMockResponse } from "@/mocks/data/practice"
import type { ActivePracticeSelection, PracticePageResponse } from "@/models/practice"
import { renderWithProviders } from "@/test/render"

import {
  PracticeView,
  type PracticeAnsweringActions,
  type PracticeAnsweringPending,
  type PracticeFollowUpActions,
  type PracticeFollowUpPending,
} from "./PracticeView"

function createAnsweringActions(
  overrides: Partial<PracticeAnsweringActions> = {},
): PracticeAnsweringActions {
  return {
    onEnd: vi.fn(async () => "executed" as const),
    onRequestFramework: vi.fn(async () => "executed" as const),
    onRequestHint: vi.fn(async () => "executed" as const),
    onSetSaved: vi.fn(async () => "executed" as const),
    onSetWeak: vi.fn(async () => "executed" as const),
    onSkip: vi.fn(async () => "executed" as const),
    onSubmitAnswer: vi.fn(async () => "executed" as const),
    ...overrides,
  }
}

const answeringPending: PracticeAnsweringPending = {
  end: false,
  framework: false,
  hint: false,
  interactionLocked: false,
  saved: false,
  skip: false,
  submitAnswer: false,
  weak: false,
}

function createFollowUpActions(
  overrides: Partial<PracticeFollowUpActions> = {},
): PracticeFollowUpActions {
  return {
    onEndFollowUps: vi.fn(async () => "executed" as const),
    onSubmitFollowUp: vi.fn(async () => "executed" as const),
    ...overrides,
  }
}

const followUpPending: PracticeFollowUpPending = {
  end: false,
  interactionLocked: false,
  submit: false,
}

function renderReadyView(
  data: PracticePageResponse,
  options: {
    generationError?: boolean
    isGenerationRetrying?: boolean
    isStarting?: boolean
    onRetryGeneration?: () => void
    onStart?: (input: ActivePracticeSelection) => Promise<void>
    answeringActions?: PracticeAnsweringActions
    answeringPending?: PracticeAnsweringPending
    followUpActions?: PracticeFollowUpActions
    followUpPending?: PracticeFollowUpPending
  } = {},
) {
  const onStart = options.onStart ?? vi.fn(async () => undefined)
  const actions = options.answeringActions ?? createAnsweringActions()
  const renderResult = renderWithProviders(
    <PracticeView
      answeringActions={actions}
      answeringPending={options.answeringPending ?? answeringPending}
      followUpActions={options.followUpActions ?? createFollowUpActions()}
      followUpPending={options.followUpPending ?? followUpPending}
      content={{ status: "ready", data }}
      generationError={options.generationError ?? false}
      isGenerationRetrying={options.isGenerationRetrying ?? false}
      isStarting={options.isStarting ?? false}
      onRetryGeneration={options.onRetryGeneration ?? vi.fn()}
      onStart={onStart}
      variant="default"
    />,
    { router: { initialEntries: ["/practice"] } },
  )
  return { actions, onStart, ...renderResult }
}

function getStartButton() {
  return screen.getByRole("button", { name: i18n.t("practice.actions.start") })
}

describe("PracticeView", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("keeps the page and setup card titles visible while loading", async () => {
    renderWithProviders(<PracticeView content={{ status: "loading" }} variant="default" />)

    expect(
      await screen.findByRole("heading", { name: i18n.t("practice.title") }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: i18n.t("practice.setup.title") }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("practice-loading-state")).toHaveAttribute("aria-busy", "true")
  })

  it("selects the current target role and recommended defaults", async () => {
    const data = createPracticeMockResponse("setupReady")
    renderReadyView(data)

    expect(await screen.findByTestId("practice-target-role-trigger")).toHaveTextContent(
      "Senior Frontend Engineer",
    )
    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionTypes.projectDeepDive") }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", { name: i18n.t("practice.difficulty.basic") }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", { name: i18n.t("practice.sources.personalized") }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("switch", { name: i18n.t("practice.setup.fields.prioritizeWeaknesses") }),
    ).not.toBeChecked()
  })

  it("renders the setup selection returned by the service without reapplying a default", async () => {
    const data = createPracticeMockResponse("setupReady")
    if (data.session.status !== "setup") return
    data.session.selection.targetRoleId = "role_product_manager_meituan"

    renderReadyView(data)

    expect(await screen.findByTestId("practice-target-role-trigger")).toHaveTextContent(
      "Product Manager",
    )
  })

  it("submits changed question type, difficulty, source, and weakness preference", async () => {
    const user = userEvent.setup()
    const onStart = vi.fn(async () => undefined)
    renderReadyView(createPracticeMockResponse("setupReady"), { onStart })
    await screen.findByTestId("practice-setup-state")

    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.questionTypes.behavioral") }),
    )
    await user.click(screen.getByRole("button", { name: i18n.t("practice.difficulty.pressure") }))
    await user.click(screen.getByRole("button", { name: i18n.t("practice.sources.saved") }))
    await user.click(
      screen.getByRole("switch", { name: i18n.t("practice.setup.fields.prioritizeWeaknesses") }),
    )
    await user.click(getStartButton())

    expect(onStart).toHaveBeenCalledWith({
      targetRoleId: "role_frontend_bytedance",
      questionType: "behavioral",
      difficulty: "pressure",
      source: "saved",
      prioritizeWeaknesses: true,
    })
  })

  it("derives technical-question availability from the selected role", async () => {
    const user = userEvent.setup()
    renderReadyView(createPracticeMockResponse("setupReady"))
    await screen.findByTestId("practice-setup-state")

    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionTypes.technicalFoundation") }),
    ).toBeInTheDocument()

    await user.click(screen.getByTestId("practice-target-role-trigger"))
    await user.click(await screen.findByRole("option", { name: /Product Manager/ }))

    expect(
      screen.queryByRole("button", { name: i18n.t("practice.questionTypes.technicalFoundation") }),
    ).not.toBeInTheDocument()
  })

  it("prevents duplicate submissions while the first submission is pending", async () => {
    const user = userEvent.setup()
    let resolveStart: (() => void) | undefined
    const onStart = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve
        }),
    )
    renderReadyView(createPracticeMockResponse("setupReady"), { onStart })
    await screen.findByTestId("practice-setup-state")

    await user.click(getStartButton())
    const pendingButton = screen.getByRole("button", {
      name: i18n.t("practice.actions.starting"),
    })
    expect(pendingButton).toBeDisabled()
    await user.click(pendingButton)
    expect(onStart).toHaveBeenCalledTimes(1)
    resolveStart?.()
  })

  it.each([
    ["noEligibleSavedQuestions", "saved"],
    ["noEligibleHistoryQuestions", "history"],
  ] as const)("explains and recovers from %s", async (scenario, source) => {
    const user = userEvent.setup()
    renderReadyView(createPracticeMockResponse(scenario))

    const alert = await screen.findByTestId(`practice-no-${source}-questions`)
    expect(alert).toBeInTheDocument()
    expect(getStartButton()).toBeDisabled()
    await user.click(
      within(alert).getByRole("button", { name: i18n.t("practice.actions.usePersonalized") }),
    )

    expect(screen.queryByTestId(`practice-no-${source}-questions`)).not.toBeInTheDocument()
    expect(getStartButton()).toBeEnabled()
  })

  it("preserves form input after a safe start error", async () => {
    const user = userEvent.setup()
    const onStart = vi.fn(async () => {
      throw new Error("unsafe backend details")
    })
    renderReadyView(createPracticeMockResponse("setupReady"), { onStart })
    await screen.findByTestId("practice-setup-state")

    const pressureButton = screen.getByRole("button", {
      name: i18n.t("practice.difficulty.pressure"),
    })
    await user.click(pressureButton)
    await user.click(getStartButton())

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.startDescription"),
    )
    expect(screen.queryByText("unsafe backend details")).not.toBeInTheDocument()
    expect(pressureButton).toHaveAttribute("aria-pressed", "true")
  })

  it("keeps settings visible after generation fails and retries once", async () => {
    const user = userEvent.setup()
    const data = createPracticeMockResponse("generatingQuestion")
    if (data.session.status !== "generatingQuestion") return
    data.session.selection.difficulty = "pressure"
    const onRetryGeneration = vi.fn()
    renderReadyView(data, { generationError: true, onRetryGeneration })

    const errorState = await screen.findByTestId("practice-generation-error-state")
    expect(errorState).toHaveTextContent(i18n.t("practice.difficulty.pressure"))
    expect(errorState).toHaveTextContent("Senior Frontend Engineer")
    await user.click(
      within(errorState).getByRole("button", {
        name: i18n.t("practice.actions.retryGeneration"),
      }),
    )
    expect(onRetryGeneration).toHaveBeenCalledTimes(1)
  })

  it("shows the question card without internal scoring or answer content", async () => {
    const data = createPracticeMockResponse("answeringQuestion")
    renderReadyView(data)
    if (data.session.status !== "answering") return

    const card = await screen.findByTestId("practice-question-card")
    expect(card).toHaveTextContent(data.session.question.prompt)
    expect(card).toHaveTextContent(data.session.question.assessedCapabilities[0] ?? "")
    expect(card).toHaveTextContent(data.session.question.recommendedMaterials[0] ?? "")
    expect(screen.queryByText(/完整参考答案|完整评分标准|内部追问策略/)).not.toBeInTheDocument()
  })

  it("keeps an empty answer from being submitted", async () => {
    const { actions } = renderReadyView(createPracticeMockResponse("answeringQuestion"))

    expect(
      await screen.findByRole("button", { name: i18n.t("practice.answer.submit") }),
    ).toBeDisabled()
    expect(actions.onSubmitAnswer).not.toHaveBeenCalled()
  })

  it("submits the main answer with the current session contract", async () => {
    const user = userEvent.setup()
    const data = createPracticeMockResponse("answeringQuestion")
    const { actions } = renderReadyView(data)
    if (data.session.status !== "answering") return

    await user.type(
      await screen.findByLabelText(i18n.t("practice.answer.label")),
      "我先定位性能瓶颈，再推动团队按阶段上线优化。",
    )
    await user.click(screen.getByRole("button", { name: i18n.t("practice.answer.submit") }))

    expect(actions.onSubmitAnswer).toHaveBeenCalledWith({
      sessionId: data.session.sessionId,
      version: data.session.version,
      questionId: data.session.question.id,
      content: "我先定位性能瓶颈，再推动团队按阶段上线优化。",
    })
  })

  it("preserves the answer draft after a safe submission error", async () => {
    const user = userEvent.setup()
    const answer = "这是一段需要在失败后保留的回答。"
    const actions = createAnsweringActions({
      onSubmitAnswer: vi.fn(async () => {
        throw new Error("unsafe submission detail")
      }),
    })
    renderReadyView(createPracticeMockResponse("answeringQuestion"), { answeringActions: actions })

    const textarea = await screen.findByLabelText(i18n.t("practice.answer.label"))
    await user.type(textarea, answer)
    await user.click(screen.getByRole("button", { name: i18n.t("practice.answer.submit") }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.submitDescription"),
    )
    expect(screen.queryByText("unsafe submission detail")).not.toBeInTheDocument()
    expect(textarea).toHaveValue(answer)
  })

  it("requests hint and answer framework separately", async () => {
    const user = userEvent.setup()
    const data = createPracticeMockResponse("answeringQuestion")
    const { actions } = renderReadyView(data)
    if (data.session.status !== "answering") return
    const expectedInput = {
      sessionId: data.session.sessionId,
      version: data.session.version,
      questionId: data.session.question.id,
    }

    await user.click(
      await screen.findByRole("button", { name: i18n.t("practice.guidance.requestHint") }),
    )
    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.guidance.requestFramework") }),
    )

    expect(actions.onRequestHint).toHaveBeenCalledWith(expectedInput)
    expect(actions.onRequestFramework).toHaveBeenCalledWith(expectedInput)
  })

  it("keeps ignored guidance requests available without showing errors", async () => {
    const user = userEvent.setup()
    const requestHint = vi
      .fn<PracticeAnsweringActions["onRequestHint"]>()
      .mockResolvedValueOnce("ignored")
      .mockResolvedValueOnce("executed")
    const requestFramework = vi
      .fn<PracticeAnsweringActions["onRequestFramework"]>()
      .mockResolvedValueOnce("ignored")
      .mockResolvedValueOnce("executed")
    renderReadyView(createPracticeMockResponse("answeringQuestion"), {
      answeringActions: createAnsweringActions({
        onRequestFramework: requestFramework,
        onRequestHint: requestHint,
      }),
    })

    const hintButton = await screen.findByRole("button", {
      name: i18n.t("practice.guidance.requestHint"),
    })
    const frameworkButton = screen.getByRole("button", {
      name: i18n.t("practice.guidance.requestFramework"),
    })
    await user.click(hintButton)
    await user.click(hintButton)
    await user.click(frameworkButton)
    await user.click(frameworkButton)

    expect(requestHint).toHaveBeenCalledTimes(2)
    expect(requestFramework).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(hintButton).toBeEnabled()
    expect(frameworkButton).toBeEnabled()
  })

  it("shows safe guidance errors and allows retry", async () => {
    const user = userEvent.setup()
    const requestHint = vi
      .fn<PracticeAnsweringActions["onRequestHint"]>()
      .mockRejectedValueOnce(new Error("unsafe hint details"))
      .mockResolvedValueOnce("executed")
    const requestFramework = vi
      .fn<PracticeAnsweringActions["onRequestFramework"]>()
      .mockRejectedValueOnce(new Error("unsafe framework details"))
      .mockResolvedValueOnce("executed")
    renderReadyView(createPracticeMockResponse("answeringQuestion"), {
      answeringActions: createAnsweringActions({
        onRequestFramework: requestFramework,
        onRequestHint: requestHint,
      }),
    })

    const hintButton = await screen.findByRole("button", {
      name: i18n.t("practice.guidance.requestHint"),
    })
    const frameworkButton = screen.getByRole("button", {
      name: i18n.t("practice.guidance.requestFramework"),
    })
    await user.click(hintButton)
    expect(await screen.findByText(i18n.t("practice.errors.hintDescription"))).toBeInTheDocument()
    expect(screen.queryByText("unsafe hint details")).not.toBeInTheDocument()
    await user.click(hintButton)

    await user.click(frameworkButton)
    expect(
      await screen.findByText(i18n.t("practice.errors.frameworkDescription")),
    ).toBeInTheDocument()
    expect(screen.queryByText("unsafe framework details")).not.toBeInTheDocument()
    await user.click(frameworkButton)

    expect(requestHint).toHaveBeenCalledTimes(2)
    expect(requestFramework).toHaveBeenCalledTimes(2)
  })

  it("requests saved and weak state changes without optimistic UI", async () => {
    const user = userEvent.setup()
    const data = createPracticeMockResponse("answeringQuestion")
    const { actions } = renderReadyView(data)
    if (data.session.status !== "answering") return

    const saveButton = await screen.findByRole("button", {
      name: i18n.t("practice.questionActions.save"),
    })
    const weakButton = screen.getByRole("button", {
      name: i18n.t("practice.questionActions.markWeak"),
    })
    await user.click(saveButton)
    await user.click(weakButton)

    expect(actions.onSetSaved).toHaveBeenCalledWith({
      sessionId: data.session.sessionId,
      version: data.session.version,
      questionId: data.session.question.id,
      isSaved: true,
    })
    expect(actions.onSetWeak).toHaveBeenCalledWith({
      sessionId: data.session.sessionId,
      version: data.session.version,
      questionId: data.session.question.id,
      isMarkedWeak: true,
    })
    expect(saveButton).toHaveAttribute("aria-pressed", "false")
    expect(weakButton).toHaveAttribute("aria-pressed", "false")
  })

  it("keeps server question states after save and weak actions fail", async () => {
    const user = userEvent.setup()
    const actions = createAnsweringActions({
      onSetSaved: vi.fn(async () => {
        throw new Error("unsafe saved details")
      }),
      onSetWeak: vi.fn(async () => {
        throw new Error("unsafe weak details")
      }),
    })
    renderReadyView(createPracticeMockResponse("answeringQuestion"), { answeringActions: actions })

    const saveButton = await screen.findByRole("button", {
      name: i18n.t("practice.questionActions.save"),
    })
    const weakButton = screen.getByRole("button", {
      name: i18n.t("practice.questionActions.markWeak"),
    })
    await user.click(saveButton)
    expect(await screen.findByText(i18n.t("practice.errors.savedDescription"))).toBeInTheDocument()
    expect(saveButton).toHaveAttribute("aria-pressed", "false")

    await user.click(weakButton)
    expect(await screen.findByText(i18n.t("practice.errors.weakDescription"))).toBeInTheDocument()
    expect(weakButton).toHaveAttribute("aria-pressed", "false")
    expect(screen.queryByText(/unsafe saved details|unsafe weak details/)).not.toBeInTheDocument()
  })

  it("requires confirmation before skipping the current question", async () => {
    const user = userEvent.setup()
    const { actions } = renderReadyView(createPracticeMockResponse("answeringQuestion"))

    await user.click(
      await screen.findByRole("button", { name: i18n.t("practice.questionActions.skip") }),
    )
    expect(actions.onSkip).not.toHaveBeenCalled()
    const dialog = screen.getByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("practice.dialog.confirmSkip") }),
    )
    expect(actions.onSkip).toHaveBeenCalledTimes(1)
  })

  it("requires confirmation before ending the practice session", async () => {
    const user = userEvent.setup()
    const { actions } = renderReadyView(createPracticeMockResponse("answeringQuestion"))

    await user.click(
      await screen.findByRole("button", { name: i18n.t("practice.questionActions.end") }),
    )
    expect(actions.onEnd).not.toHaveBeenCalled()
    const dialog = screen.getByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("practice.dialog.confirmEnd") }),
    )
    expect(actions.onEnd).toHaveBeenCalledTimes(1)
  })

  it("blocks route changes while an unsubmitted draft exists", async () => {
    const user = userEvent.setup()
    const { router } = renderReadyView(createPracticeMockResponse("answeringQuestion"))

    await user.type(await screen.findByLabelText(i18n.t("practice.answer.label")), "尚未提交的回答")
    act(() => {
      void router?.navigate({ to: "/profile" })
    })

    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(i18n.t("practice.dialog.leaveTitle"))).toBeInTheDocument()
    expect(router?.state.location.pathname).toBe("/practice")
  })

  it("renders the complete follow-up timeline in conversation order", async () => {
    const data = createPracticeMockResponse("answeringFollowUp")
    renderReadyView(data)
    if (data.session.status !== "answeringFollowUp") return

    const timeline = await screen.findByTestId("practice-conversation-timeline")
    const content = timeline.textContent ?? ""
    const orderedText = [
      data.session.question.prompt,
      data.session.mainAnswer.content,
      data.session.followUpExchanges[0]?.question.prompt ?? "",
      data.session.followUpExchanges[0]?.answer.content ?? "",
      data.session.currentFollowUp.question.prompt,
    ]
    let previousIndex = -1
    for (const text of orderedText) {
      const index = content.indexOf(text)
      expect(index).toBeGreaterThan(previousIndex)
      previousIndex = index
    }
    expect(
      within(timeline)
        .getByText(data.session.currentFollowUp.question.prompt)
        .closest("[aria-current='step']"),
    ).toBeInTheDocument()
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
  })

  it("submits the current follow-up with its exact version and question IDs", async () => {
    const user = userEvent.setup()
    const data = createPracticeMockResponse("answeringSingleFollowUp")
    const actions = createFollowUpActions()
    renderReadyView(data, { followUpActions: actions })
    if (data.session.status !== "answeringFollowUp") return

    await user.type(
      await screen.findByLabelText(i18n.t("practice.followUp.answerLabel")),
      "我会把验证标准前置，并在关键节点主动同步风险。",
    )
    await user.click(screen.getByRole("button", { name: i18n.t("practice.followUp.submit") }))

    expect(actions.onSubmitFollowUp).toHaveBeenCalledWith({
      sessionId: data.session.sessionId,
      version: data.session.version,
      questionId: data.session.question.id,
      followUpQuestionId: data.session.currentFollowUp.question.id,
      content: "我会把验证标准前置，并在关键节点主动同步风险。",
    })
  })

  it("preserves a follow-up draft after a safe submit error", async () => {
    const user = userEvent.setup()
    const actions = createFollowUpActions({
      onSubmitFollowUp: vi.fn(async () => {
        throw new Error("unsafe details")
      }),
    })
    renderReadyView(createPracticeMockResponse("answeringSingleFollowUp"), {
      followUpActions: actions,
    })
    const textbox = await screen.findByLabelText(i18n.t("practice.followUp.answerLabel"))
    await user.type(textbox, "失败后仍需保留的追问回答")
    await user.click(screen.getByRole("button", { name: i18n.t("practice.followUp.submit") }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.followUpSubmitDescription"),
    )
    expect(textbox).toHaveValue("失败后仍需保留的追问回答")
    expect(screen.queryByText("unsafe details")).not.toBeInTheDocument()
  })

  it("shows real processing state while waiting for the next follow-up", async () => {
    renderReadyView(createPracticeMockResponse("answeringSingleFollowUp"), {
      followUpPending: { end: false, interactionLocked: true, submit: true },
    })

    expect(await screen.findByText(i18n.t("practice.followUp.processing"))).toBeVisible()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.followUp.submitting") }),
    ).toBeDisabled()
    expect(screen.getByLabelText(i18n.t("practice.followUp.answerLabel"))).toBeDisabled()
  })

  it("requires an explicit confirmation before ending an unanswered follow-up", async () => {
    const user = userEvent.setup()
    const data = createPracticeMockResponse("answeringSingleFollowUp")
    const actions = createFollowUpActions()
    renderReadyView(data, { followUpActions: actions })
    if (data.session.status !== "answeringFollowUp") return

    await user.click(
      await screen.findByRole("button", { name: i18n.t("practice.followUp.endAnswering") }),
    )
    expect(actions.onEndFollowUps).not.toHaveBeenCalled()
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: i18n.t("practice.followUp.confirmEnd"),
      }),
    )

    expect(actions.onEndFollowUps).toHaveBeenCalledWith({
      sessionId: data.session.sessionId,
      version: data.session.version,
      questionId: data.session.question.id,
      followUpQuestionId: data.session.currentFollowUp.question.id,
    })
  })

  it("keeps the completed timeline visible while scoring is pending", async () => {
    const data = createPracticeMockResponse("evaluatingNoFollowUp")
    renderReadyView(data)
    if (data.session.status !== "evaluating") return

    const timeline = await screen.findByTestId("practice-conversation-timeline")
    expect(timeline).toHaveTextContent(data.session.question.prompt)
    expect(timeline).toHaveTextContent(data.session.mainAnswer.content)
    expect(screen.getByTestId("practice-evaluating-state")).toHaveTextContent(
      i18n.t("practice.evaluating.title"),
    )
    expect(screen.queryByLabelText(i18n.t("practice.followUp.answerLabel"))).not.toBeInTheDocument()
  })

  it("shows the unanswered follow-up in order after follow-ups end early", async () => {
    const data = createPracticeMockResponse("evaluatingFollowUpEndedEarly")
    renderReadyView(data)
    if (
      data.session.status !== "evaluating" ||
      data.session.followUpCompletion.status !== "endedEarly"
    ) {
      return
    }

    const timeline = await screen.findByTestId("practice-conversation-timeline")
    const answered = data.session.followUpExchanges[0]
    if (!answered) throw new Error("The ended-early fixture must contain an answered follow-up.")
    const unanswered = data.session.followUpCompletion.unansweredQuestion
    const orderedText = [
      data.session.question.prompt,
      data.session.mainAnswer.content,
      answered.question.prompt,
      answered.answer.content,
      unanswered.prompt,
      i18n.t("practice.followUp.endedEarly"),
    ]
    let previousIndex = -1
    for (const text of orderedText) {
      const index = timeline.textContent?.indexOf(text) ?? -1
      expect(index).toBeGreaterThan(previousIndex)
      previousIndex = index
    }

    expect(timeline).toHaveTextContent(
      i18n.t("practice.followUp.unansweredFollowUp", { count: unanswered.order }),
    )
    expect(timeline).not.toHaveTextContent(
      i18n.t("practice.followUp.yourFollowUpAnswer", { count: unanswered.order }),
    )
    expect(screen.queryByLabelText(i18n.t("practice.followUp.answerLabel"))).not.toBeInTheDocument()
  })
})
