import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"
import type { ActiveSelection, PracticeData, PracticeSession } from "@/models/practice-workflow"
import { renderWithProviders } from "@/test/render"

import {
  PracticeView,
  type PracticeAnsweringActions,
  type PracticeAnsweringPending,
  type PracticeCompletedActions,
  type PracticeFollowUpActions,
  type PracticeFollowUpPending,
  type PracticeReviewActions,
  type PracticeReviewPending,
} from "./PracticeView"
import { PracticeReviewActions as PracticeReviewActionsComponent } from "./components/PracticeReviewActions"

function createAnsweringActions(
  overrides: Partial<PracticeAnsweringActions> = {},
): PracticeAnsweringActions {
  return {
    onEnd: vi.fn(async () => "executed" as const),
    onRequestFramework: vi.fn(async () => "executed" as const),
    onRequestHint: vi.fn(async () => "executed" as const),
    onRequestReferenceAnswer: vi.fn(async () => "executed" as const),
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
  referenceAnswer: false,
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
    onRequestFramework: vi.fn(async () => "executed" as const),
    onRequestHint: vi.fn(async () => "executed" as const),
    onRequestReferenceAnswer: vi.fn(async () => "executed" as const),
    onSubmitFollowUp: vi.fn(async () => "executed" as const),
    ...overrides,
  }
}

const followUpPending: PracticeFollowUpPending = {
  end: false,
  framework: false,
  hint: false,
  interactionLocked: false,
  referenceAnswer: false,
  submit: false,
}

function createReviewActions(
  overrides: Partial<PracticeReviewActions> = {},
): PracticeReviewActions {
  return {
    onEndSession: vi.fn(async () => "executed" as const),
    onNextQuestion: vi.fn(async () => "executed" as const),
    onRetryCurrent: vi.fn(async () => "executed" as const),
    onSetSaved: vi.fn(async () => "executed" as const),
    onSetWeak: vi.fn(async () => "executed" as const),
    ...overrides,
  }
}

const reviewPending: PracticeReviewPending = {
  end: false,
  interactionLocked: false,
  next: false,
  retry: false,
  saved: false,
  weak: false,
}

function renderReadyView(
  data: PracticeData,
  options: {
    generationError?: boolean
    isGenerationRetrying?: boolean
    isStarting?: boolean
    onRetryGeneration?: () => void
    onStart?: (input: ActiveSelection) => Promise<void>
    answeringActions?: PracticeAnsweringActions
    answeringPending?: PracticeAnsweringPending
    followUpActions?: PracticeFollowUpActions
    followUpPending?: PracticeFollowUpPending
    reviewActions?: PracticeReviewActions
    reviewPending?: PracticeReviewPending
    completedActions?: PracticeCompletedActions
    completedPending?: boolean
    evaluationError?: boolean
    isEvaluationRetrying?: boolean
    onRetryEvaluation?: () => void
  } = {},
) {
  const onStart = options.onStart ?? vi.fn(async () => undefined)
  const actions = options.answeringActions ?? createAnsweringActions()
  const followUpActions = options.followUpActions ?? createFollowUpActions()
  const renderView = (viewData: PracticeData) => (
    <PracticeView
      answeringActions={actions}
      answeringPending={options.answeringPending ?? answeringPending}
      completedActions={
        options.completedActions ?? { onPrepareNextRound: vi.fn(async () => "executed" as const) }
      }
      completedPending={options.completedPending ?? false}
      followUpActions={followUpActions}
      followUpPending={options.followUpPending ?? followUpPending}
      reviewActions={options.reviewActions ?? createReviewActions()}
      reviewPending={options.reviewPending ?? reviewPending}
      content={{ status: "ready", data: viewData }}
      evaluationError={options.evaluationError ?? false}
      generationError={options.generationError ?? false}
      isEvaluationRetrying={options.isEvaluationRetrying ?? false}
      isGenerationRetrying={options.isGenerationRetrying ?? false}
      isStarting={options.isStarting ?? false}
      onRetryGeneration={options.onRetryGeneration ?? vi.fn()}
      onRetryEvaluation={options.onRetryEvaluation ?? vi.fn()}
      onStart={onStart}
      variant="default"
    />
  )
  const renderResult = renderWithProviders(renderView(data), {
    router: { initialEntries: ["/practice"] },
  })
  return {
    actions,
    onStart,
    rerenderReady: (viewData: PracticeData) => renderResult.rerender(renderView(viewData)),
    ...renderResult,
  }
}

function getStartButton() {
  return screen.getByRole("button", { name: i18n.t("practice.actions.start") })
}

function getSetupSelectionControls() {
  const setup = screen.getByTestId("practice-setup-state")
  return [
    screen.getByTestId("practice-role-trigger"),
    ...setup.querySelectorAll<HTMLElement>('[data-slot="toggle-group-item"]'),
    screen.getByRole("switch", {
      name: i18n.t("practice.setup.fields.prioritizeWeaknesses"),
    }),
  ]
}

function expectControlDisabled(control: HTMLElement) {
  expect(control.matches(":disabled") || control.getAttribute("aria-disabled") === "true").toBe(
    true,
  )
}

function expectControlEnabled(control: HTMLElement) {
  expect(control.matches(":disabled")).toBe(false)
  expect(control).not.toHaveAttribute("aria-disabled", "true")
}

const sessionStateCases = {
  setup: { scenario: "setupReady", testId: "practice-setup-state" },
  generatingQuestion: {
    scenario: "generatingQuestion",
    testId: "practice-generating-state",
  },
  answering: { scenario: "answeringQuestion", testId: "practice-answering-state" },
  answeringFollowUp: {
    scenario: "answeringFirstFollowUp",
    testId: "practice-answering-follow-up-state",
  },
  evaluating: { scenario: "evaluatingAnswer", testId: "practice-evaluating-state" },
  review: { scenario: "reviewBalanced", testId: "practice-review-state" },
  completed: { scenario: "completedSession", testId: "practice-completed-state" },
} as const satisfies Record<
  PracticeSession["status"],
  {
    scenario: Parameters<typeof createPracticeScenario>[0]
    testId: string
  }
>

describe("PracticeView", () => {
  it.each(Object.entries(sessionStateCases))(
    "renders the explicit %s session branch",
    async (status, { scenario, testId }) => {
      const data = createPracticeScenario(scenario)
      expect(data.session.status).toBe(status)

      renderReadyView(data)

      expect(await screen.findByTestId(testId)).toBeInTheDocument()
      expect(screen.queryByText(/答题区将在下一步中实现/)).not.toBeInTheDocument()
    },
  )

  it("shows a safe label instead of an internal role ID when selection metadata is missing", async () => {
    const data = createPracticeScenario("generatingQuestion")
    if (data.session.status !== "generatingQuestion") {
      throw new Error("Generating fixture required.")
    }
    const internalRoleId = data.session.selection.roleId
    data.setupContext.roles = []

    renderReadyView(data)

    const generating = await screen.findByTestId("practice-generating-state")
    expect(generating).toHaveTextContent(i18n.t("practice.session.unknownRole"))
    expect(generating).not.toHaveTextContent(internalRoleId)
  })

  it("renders the completed summary with next-round and training-history actions", async () => {
    const data = createPracticeScenario("completedSession")
    if (data.session.status !== "completed") throw new Error("Completed fixture required.")
    renderReadyView(data)

    const completed = await screen.findByTestId("practice-completed-state")
    expect(completed).toHaveTextContent(i18n.t("practice.completed.questions", { count: 1 }))
    expect(completed).toHaveTextContent(i18n.t("practice.completed.retries", { count: 0 }))
    expect(completed).toHaveTextContent(i18n.t("practice.completed.saved", { count: 0 }))
    expect(completed).toHaveTextContent(i18n.t("practice.completed.markedWeak", { count: 0 }))
    expect(completed).toHaveTextContent(
      i18n.t("practice.completed.finalAttemptAverage", {
        score: data.session.finalAttemptAverageScore,
      }),
    )
    expect(
      screen.getByRole("button", { name: i18n.t("practice.completed.startNextRound") }),
    ).toBeEnabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.completed.viewHistory") }),
    ).toHaveAttribute("href", expect.stringContaining("/history?"))
  })

  it("keeps the completed summary and actions safe when next-round preparation is ignored", async () => {
    const user = userEvent.setup()
    const onPrepareNextRound = vi.fn(async () => "ignored" as const)
    renderReadyView(createPracticeScenario("completedSession"), {
      completedActions: { onPrepareNextRound },
    })

    await user.click(
      await screen.findByRole("button", { name: i18n.t("practice.completed.startNextRound") }),
    )

    expect(onPrepareNextRound).toHaveBeenCalledOnce()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByTestId("practice-completed-state")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.completed.startNextRound") }),
    ).toBeEnabled()
  })

  it("keeps all review actions in a fixed, sidebar-aware bottom bar", async () => {
    renderReadyView(createPracticeScenario("reviewBalanced"))

    const review = await screen.findByTestId("practice-review-state")
    expect(review).toHaveClass("pb-80", "min-[360px]:pb-52", "sm:pb-40", "lg:pb-28")

    const actionBar = screen.getByTestId("practice-review-actions-bar")
    expect(actionBar.closest("[data-slot='card']")).not.toBeInTheDocument()

    const actions = within(actionBar)
    for (const name of [
      i18n.t("practice.review.retryCurrent"),
      i18n.t("practice.review.nextQuestion"),
      i18n.t("practice.review.endSession"),
      i18n.t("practice.questionActions.save"),
      i18n.t("practice.questionActions.markWeak"),
    ]) {
      expect(actions.getByRole("button", { name })).toBeInTheDocument()
    }
  })

  it("confirms ending a reviewed session before invoking the action", async () => {
    const user = userEvent.setup()
    const onEndSession = vi.fn(async () => "executed" as const)
    renderReadyView(createPracticeScenario("reviewBalanced"), {
      reviewActions: createReviewActions({ onEndSession }),
    })
    await screen.findByTestId("practice-review-state")
    await user.click(screen.getByRole("button", { name: /结束本轮练习/i }))
    expect(onEndSession).not.toHaveBeenCalled()
    expect(
      screen.getByRole("heading", { name: i18n.t("practice.review.endConfirmTitle") }),
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: i18n.t("practice.dialog.stay") }))
    expect(onEndSession).not.toHaveBeenCalled()
  })

  it("shows safe review-action errors without exposing service details", async () => {
    const user = userEvent.setup()
    renderReadyView(createPracticeScenario("reviewBalanced"), {
      reviewActions: createReviewActions({
        onRetryCurrent: vi.fn(async () => {
          throw new Error("internal detail")
        }),
      }),
    })
    await screen.findByTestId("practice-review-state")
    await user.click(screen.getByRole("button", { name: /重练当前题/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.retryDescription"),
    )
    expect(screen.queryByText("internal detail")).not.toBeInTheDocument()
  })

  it("keeps review actions safe when retry, next, or end are ignored", async () => {
    const user = userEvent.setup()
    const actions = createReviewActions({
      onEndSession: vi.fn(async () => "ignored" as const),
      onNextQuestion: vi.fn(async () => "ignored" as const),
      onRetryCurrent: vi.fn(async () => "ignored" as const),
    })
    renderReadyView(createPracticeScenario("reviewBalanced"), { reviewActions: actions })
    await screen.findByTestId("practice-review-state")
    await user.click(screen.getByRole("button", { name: /重练当前题/i }))
    await user.click(screen.getByRole("button", { name: /继续下一题/i }))
    await user.click(screen.getByRole("button", { name: /结束本轮练习/i }))
    await user.click(screen.getAllByRole("button", { name: /结束本轮练习/i }).at(-1)!)
    expect(actions.onRetryCurrent).toHaveBeenCalledTimes(1)
    expect(actions.onNextQuestion).toHaveBeenCalledTimes(1)
    expect(actions.onEndSession).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByTestId("practice-review-state")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: i18n.t("practice.dialog.stay") }))
    expect(screen.getByRole("button", { name: /重练当前题/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /继续下一题/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /结束本轮练习/i })).toBeEnabled()
  })

  it("shows safe next and end failures while remaining in review", async () => {
    const user = userEvent.setup()
    const internal = "Private request detail"
    const onEndSession = vi
      .fn<() => Promise<"executed">>()
      .mockRejectedValueOnce(new Error(internal))
      .mockResolvedValueOnce("executed")
    const actions = createReviewActions({
      onEndSession,
      onNextQuestion: vi.fn(async () => {
        throw new Error(internal)
      }),
    })
    renderReadyView(createPracticeScenario("reviewBalanced"), { reviewActions: actions })
    await screen.findByTestId("practice-review-state")
    await user.click(screen.getByRole("button", { name: /继续下一题/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.nextDescription"),
    )
    expect(screen.queryByText(internal)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /继续下一题/i })).toBeEnabled()
    await user.click(screen.getByRole("button", { name: /结束本轮练习/i }))
    const dialog = screen.getByRole("alertdialog")
    const confirm = within(dialog).getByRole("button", { name: /结束本轮练习/i })
    await user.click(confirm)
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      i18n.t("practice.errors.reviewEndDescription"),
    )
    expect(within(dialog).queryByText(internal)).not.toBeInTheDocument()
    expect(screen.getByTestId("practice-review-state")).toBeInTheDocument()
    expect(dialog).toBeVisible()

    await user.click(confirm)
    expect(onEndSession).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  })

  it.each(["retry", "next", "end"] as const)(
    "disables all review actions while %s is pending",
    async (pendingAction) => {
      const pending = { ...reviewPending, interactionLocked: true, [pendingAction]: true }
      renderReadyView(createPracticeScenario("reviewBalanced"), { reviewPending: pending })
      await screen.findByTestId("practice-review-state")
      for (const name of [
        /重练当前题/i,
        /继续下一题/i,
        /结束本轮练习/i,
        /收藏题目/i,
        /标记(为)?薄弱题/i,
      ]) {
        expect(screen.getByRole("button", { name })).toBeDisabled()
      }
    },
  )

  it("disables both end confirmation controls while ending is pending", async () => {
    const user = userEvent.setup()
    const props = {
      isWeak: false,
      isSaved: false,
      isSavedPending: false,
      isWeakPending: false,
      onEndSession: vi.fn(async () => "executed" as const),
      onNextQuestion: vi.fn(async () => "executed" as const),
      onRetryCurrent: vi.fn(async () => "executed" as const),
      onSetSaved: vi.fn(async (_isSaved: boolean) => "executed" as const),
      onSetWeak: vi.fn(async (_isWeak: boolean) => "executed" as const),
    }
    const { rerender } = renderWithProviders(
      <PracticeReviewActionsComponent
        {...props}
        interactionLocked={false}
        isEndPending={false}
        isNextPending={false}
        isRetryPending={false}
      />,
      { router: false },
    )
    await user.click(screen.getByRole("button", { name: /结束本轮练习/i }))
    rerender(
      <PracticeReviewActionsComponent
        {...props}
        interactionLocked
        isEndPending
        isNextPending={false}
        isRetryPending={false}
      />,
    )
    const dialog = await screen.findByRole("alertdialog")
    expect(
      within(dialog).getByRole("button", { name: i18n.t("practice.dialog.stay") }),
    ).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: /结束本轮练习/i })).toBeDisabled()
  })
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

  it("moves focus to the current practice region after a session phase changes", async () => {
    const answering = createPracticeScenario("answeringQuestion")
    const review = createPracticeScenario("reviewBalanced")
    const actions = createAnsweringActions()
    const followUpActions = createFollowUpActions()
    const reviewActions = createReviewActions()
    const { rerender } = renderWithProviders(
      <PracticeView
        answeringActions={actions}
        answeringPending={answeringPending}
        completedActions={{ onPrepareNextRound: vi.fn(async () => "executed" as const) }}
        completedPending={false}
        content={{ status: "ready", data: answering }}
        evaluationError={false}
        followUpActions={followUpActions}
        followUpPending={followUpPending}
        generationError={false}
        isEvaluationRetrying={false}
        isGenerationRetrying={false}
        isStarting={false}
        onRetryEvaluation={vi.fn()}
        onRetryGeneration={vi.fn()}
        onStart={vi.fn(async () => undefined)}
        reviewActions={reviewActions}
        reviewPending={reviewPending}
        variant="default"
      />,
      { router: { initialEntries: ["/practice"] } },
    )

    expect(await screen.findByTestId("practice-answering-state")).toBeInTheDocument()

    rerender(
      <PracticeView
        answeringActions={actions}
        answeringPending={answeringPending}
        completedActions={{ onPrepareNextRound: vi.fn(async () => "executed" as const) }}
        completedPending={false}
        content={{ status: "ready", data: review }}
        evaluationError={false}
        followUpActions={followUpActions}
        followUpPending={followUpPending}
        generationError={false}
        isEvaluationRetrying={false}
        isGenerationRetrying={false}
        isStarting={false}
        onRetryEvaluation={vi.fn()}
        onRetryGeneration={vi.fn()}
        onStart={vi.fn(async () => undefined)}
        reviewActions={reviewActions}
        reviewPending={reviewPending}
        variant="default"
      />,
    )

    await waitFor(() => expect(screen.getByTestId("practice-state-region")).toHaveFocus())
    expect(screen.getByTestId("practice-review-state")).toBeInTheDocument()
  })

  it("selects the current target role and recommended defaults", async () => {
    const data = createPracticeScenario("setupReady")
    renderReadyView(data)

    expect(await screen.findByTestId("practice-role-trigger")).toHaveTextContent(
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

  it("keeps the selected option styling after focus moves away", async () => {
    const user = userEvent.setup()
    renderReadyView(createPracticeScenario("setupReady"))
    await screen.findByTestId("practice-setup-state")

    const selectedQuestionType = screen.getByRole("button", {
      name: i18n.t("practice.questionTypes.behavioral"),
    })
    await user.click(selectedQuestionType)
    await user.tab()

    expect(selectedQuestionType).not.toHaveFocus()
    expect(selectedQuestionType).toHaveAttribute("aria-pressed", "true")
    expect(selectedQuestionType).toHaveClass(
      "hover:bg-card",
      "aria-pressed:border-primary",
      "aria-pressed:bg-card",
      "aria-pressed:text-primary",
    )
  })

  it("separates the setup sections with responsive theme dividers", async () => {
    renderReadyView(createPracticeScenario("setupReady"))
    const setupCard = await screen.findByTestId("practice-setup-state")
    expect(setupCard.querySelector('[data-slot="card-header"]')).toHaveClass("border-b")

    const questionTypeFieldSet = screen
      .getByText(i18n.t("practice.setup.fields.questionType"))
      .closest('[data-slot="field-set"]')
    expect(questionTypeFieldSet).not.toHaveClass("border-t")
    expect(questionTypeFieldSet?.parentElement).toHaveClass("border-t", "border-border", "py-5")

    const sourceFieldSet = screen
      .getByText(i18n.t("practice.setup.fields.source"))
      .closest('[data-slot="field-set"]')
    expect(sourceFieldSet).not.toHaveClass("border-t")
    expect(sourceFieldSet?.parentElement).toHaveClass(
      "border-t",
      "border-border",
      "pt-5",
      "@2xl/setup:border-t-0",
      "@2xl/setup:border-l",
      "@2xl/setup:pl-6",
    )
    expect(
      screen
        .getByRole("switch", { name: i18n.t("practice.setup.fields.prioritizeWeaknesses") })
        .closest('[data-slot="field"]'),
    ).toHaveClass("border-t", "border-border", "pt-5")
  })

  it("renders the setup selection returned by the service without reapplying a default", async () => {
    const data = createPracticeScenario("setupReady")
    if (data.session.status !== "setup") return
    data.session.selection.roleId = "role_product_manager_meituan"

    renderReadyView(data)

    expect(await screen.findByTestId("practice-role-trigger")).toHaveTextContent("Product Manager")
  })

  it("submits changed question type, difficulty, source, and weakness preference", async () => {
    const user = userEvent.setup()
    const onStart = vi.fn(async () => undefined)
    renderReadyView(createPracticeScenario("setupReady"), { onStart })
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
      roleId: "role_frontend_bytedance",
      questionType: "behavioral",
      difficulty: "pressure",
      source: "saved",
      prioritizeWeaknesses: true,
    })
  })

  it("derives technical-question availability from the selected role", async () => {
    const user = userEvent.setup()
    renderReadyView(createPracticeScenario("setupReady"))
    await screen.findByTestId("practice-setup-state")

    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionTypes.technicalFoundation") }),
    ).toBeInTheDocument()

    await user.click(screen.getByTestId("practice-role-trigger"))
    await user.click(await screen.findByRole("option", { name: /Product Manager/ }))

    expect(
      screen.queryByRole("button", { name: i18n.t("practice.questionTypes.technicalFoundation") }),
    ).not.toBeInTheDocument()
  })

  it("locks the submitted selection snapshot until the start request settles", async () => {
    const user = userEvent.setup()
    let resolveStart: (() => void) | undefined
    const onStart = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve
        }),
    )
    renderReadyView(createPracticeScenario("setupReady"), { onStart })
    await screen.findByTestId("practice-setup-state")

    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.questionTypes.behavioral") }),
    )
    await user.click(screen.getByRole("button", { name: i18n.t("practice.difficulty.pressure") }))
    await user.click(screen.getByRole("button", { name: i18n.t("practice.sources.saved") }))
    await user.click(
      screen.getByRole("switch", {
        name: i18n.t("practice.setup.fields.prioritizeWeaknesses"),
      }),
    )
    await user.click(getStartButton())

    expect(onStart).toHaveBeenCalledWith({
      roleId: "role_frontend_bytedance",
      questionType: "behavioral",
      difficulty: "pressure",
      source: "saved",
      prioritizeWeaknesses: true,
    })
    const pendingButton = screen.getByRole("button", {
      name: i18n.t("practice.actions.starting"),
    })
    expect(pendingButton).toBeDisabled()
    expect(pendingButton.querySelector('[data-slot="spinner"]')).toBeInTheDocument()
    for (const control of getSetupSelectionControls()) expectControlDisabled(control)

    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.questionTypes.motivation") }),
    )
    await user.click(screen.getByRole("button", { name: i18n.t("practice.difficulty.basic") }))
    await user.click(pendingButton)
    expect(onStart).toHaveBeenCalledTimes(1)

    await act(async () => resolveStart?.())
    await waitFor(() => expect(getStartButton()).toBeEnabled())
    for (const control of getSetupSelectionControls()) expectControlEnabled(control)

    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.questionTypes.motivation") }),
    )
    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionTypes.motivation") }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(onStart).toHaveBeenCalledWith({
      roleId: "role_frontend_bytedance",
      questionType: "behavioral",
      difficulty: "pressure",
      source: "saved",
      prioritizeWeaknesses: true,
    })
  })

  it("disables every selection-changing action while external start state is pending", async () => {
    renderReadyView(createPracticeScenario("noEligibleSavedQuestions"), {
      isStarting: true,
    })
    const setup = await screen.findByTestId("practice-setup-state")
    const interactiveControls = [
      ...within(setup).queryAllByRole("button"),
      ...within(setup).queryAllByRole("combobox"),
      ...within(setup).queryAllByRole("switch"),
    ]

    expect(interactiveControls.length).toBeGreaterThan(0)
    for (const control of interactiveControls) expectControlDisabled(control)
    expect(within(setup).queryByRole("textbox")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.actions.usePersonalized") }),
    ).toBeDisabled()
  })

  it.each([
    ["noEligibleSavedQuestions", "saved"],
    ["noEligibleHistoryQuestions", "history"],
  ] as const)("explains and recovers from %s", async (scenario, source) => {
    const user = userEvent.setup()
    renderReadyView(createPracticeScenario(scenario))

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
    renderReadyView(createPracticeScenario("setupReady"), { onStart })
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
    const data = createPracticeScenario("generatingQuestion")
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
    const data = createPracticeScenario("answeringQuestion")
    renderReadyView(data)
    if (data.session.status !== "answering") return

    const card = await screen.findByTestId("practice-question-card")
    const sessionHeader = screen.getByTestId("practice-session-header")
    const questionType = i18n.t(`practice.questionTypes.${data.session.selection.questionType}`)
    const difficulty = i18n.t(`practice.difficulty.${data.session.selection.difficulty}`)
    expect(card).toHaveTextContent(data.session.question.prompt)
    expect(card).toHaveTextContent(data.session.question.assessedCapabilities[0] ?? "")
    expect(card).toHaveTextContent(data.session.question.recommendedMaterials[0] ?? "")
    expect(within(card).queryByText(questionType)).not.toBeInTheDocument()
    expect(within(card).queryByText(difficulty)).not.toBeInTheDocument()
    expect(within(sessionHeader).getByText(questionType)).toHaveClass(
      "bg-primary",
      "text-primary-foreground",
    )
    expect(within(sessionHeader).getByText(difficulty)).toHaveClass(
      "border-primary/20",
      "bg-primary/10",
      "text-primary",
    )
    expect(card.querySelector(".lucide-folder-open")).not.toBeInTheDocument()
    expect(card.querySelector(".lucide-database-search")).not.toBeInTheDocument()
    expect(screen.queryByText(/完整参考答案|完整评分标准|内部追问策略/)).not.toBeInTheDocument()
  })

  it("renders service-provided question data for an unknown template ID", async () => {
    const data = createPracticeScenario("answeringQuestion")
    if (data.session.status !== "answering") return

    data.session.question.prompt = "后端新增模板返回的问题正文"
    data.session.question.assessedCapabilities = ["后端返回的能力"]
    data.session.question.recommendedMaterials = ["后端返回的材料"]
    data.session.question.referenceAnswer = {
      status: "revealed",
      content: {
        kind: "personalizedExample",
        answer: "后端返回的参考答案",
        keyPoints: ["后端返回的要点"],
        commonMistakes: ["后端返回的常见问题"],
      },
      viewedBeforeSubmission: false,
    }

    renderReadyView(data)

    const card = await screen.findByTestId("practice-question-card")
    expect(card).toHaveTextContent("后端新增模板返回的问题正文")
    expect(card).toHaveTextContent("后端返回的能力")
    expect(card).toHaveTextContent("后端返回的材料")
    expect(screen.getByText("后端返回的参考答案")).toBeInTheDocument()
    expect(screen.queryByText("backend.new-question-template")).not.toBeInTheDocument()
  })

  it("only gives the answering view fixed actions and responsive bottom clearance", async () => {
    const { rerenderReady } = renderReadyView(createPracticeScenario("answeringQuestion"))

    const answering = await screen.findByTestId("practice-answering-state")
    expect(answering).toHaveClass("pb-56", "min-[360px]:pb-40", "sm:pb-28")
    expect(screen.getByTestId("practice-question-actions-bar")).toBeInTheDocument()

    for (const scenario of [
      "answeringSingleFollowUp",
      "reviewBalanced",
      "completedSession",
    ] as const) {
      rerenderReady(createPracticeScenario(scenario))
      await waitFor(() => {
        expect(screen.queryByTestId("practice-question-actions-bar")).not.toBeInTheDocument()
      })
    }
  })

  it("keeps an empty answer from being submitted", async () => {
    const { actions } = renderReadyView(createPracticeScenario("answeringQuestion"))

    expect(
      await screen.findByRole("button", { name: i18n.t("practice.answer.submit") }),
    ).toBeDisabled()
    expect(actions.onSubmitAnswer).not.toHaveBeenCalled()
  })

  it("submits the main answer with the current session contract", async () => {
    const user = userEvent.setup()
    const data = createPracticeScenario("answeringQuestion")
    const { actions } = renderReadyView(data)
    if (data.session.status !== "answering") return

    await user.type(
      await screen.findByLabelText(i18n.t("practice.answer.label")),
      "我先定位性能瓶颈，再推动团队按阶段上线优化。",
    )
    await user.click(screen.getByRole("button", { name: i18n.t("practice.answer.submit") }))

    expect(actions.onSubmitAnswer).toHaveBeenCalledWith(
      "我先定位性能瓶颈，再推动团队按阶段上线优化。",
    )
  })

  it("preserves the answer draft after a safe submission error", async () => {
    const user = userEvent.setup()
    const answer = "这是一段需要在失败后保留的回答。"
    const actions = createAnsweringActions({
      onSubmitAnswer: vi.fn(async () => {
        throw new Error("unsafe submission detail")
      }),
    })
    renderReadyView(createPracticeScenario("answeringQuestion"), { answeringActions: actions })

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
    const data = createPracticeScenario("answeringQuestion")
    const { actions } = renderReadyView(data)
    if (data.session.status !== "answering") return

    await user.click(
      await screen.findByRole("button", { name: i18n.t("practice.guidance.requestHint") }),
    )
    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.guidance.requestFramework") }),
    )

    expect(actions.onRequestHint).toHaveBeenCalledWith()
    expect(actions.onRequestFramework).toHaveBeenCalledWith()
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
    renderReadyView(createPracticeScenario("answeringQuestion"), {
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
    renderReadyView(createPracticeScenario("answeringQuestion"), {
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
    const data = createPracticeScenario("answeringQuestion")
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

    expect(actions.onSetSaved).toHaveBeenCalledWith(true)
    expect(actions.onSetWeak).toHaveBeenCalledWith(true)
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
    renderReadyView(createPracticeScenario("answeringQuestion"), { answeringActions: actions })

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
    const { actions } = renderReadyView(createPracticeScenario("answeringQuestion"))

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
    const { actions } = renderReadyView(createPracticeScenario("answeringQuestion"))

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
    const { router } = renderReadyView(createPracticeScenario("answeringQuestion"))

    await user.type(await screen.findByLabelText(i18n.t("practice.answer.label")), "尚未提交的回答")
    act(() => {
      void router?.navigate({ to: "/profile" })
    })

    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(i18n.t("practice.dialog.leaveTitle"))).toBeInTheDocument()
    expect(router?.state.location.pathname).toBe("/practice")
  })

  it("renders the complete follow-up timeline in conversation order", async () => {
    const data = createPracticeScenario("answeringFollowUp")
    renderReadyView(data)
    if (data.session.status !== "answeringFollowUp") return

    const timeline = await screen.findByTestId("practice-conversation-timeline")
    const content = timeline.textContent ?? ""
    const orderedText = [
      data.session.question.prompt,
      data.session.mainAnswer.content,
      data.session.followUps[0]?.question.prompt ?? "",
      data.session.followUps[0]?.answer.content ?? "",
      data.session.currentFollowUp.prompt,
    ]
    let previousIndex = -1
    for (const text of orderedText) {
      const index = content.indexOf(text)
      expect(index).toBeGreaterThan(previousIndex)
      previousIndex = index
    }
    expect(
      within(timeline)
        .getByText(data.session.currentFollowUp.prompt)
        .closest("[aria-current='step']"),
    ).toBeInTheDocument()
    const composer = screen.getByTestId("practice-follow-up-composer")
    const assistance = screen.getByTestId("practice-follow-up-assistance")
    expect(
      timeline.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      composer.compareDocumentPosition(assistance) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
  })

  it("renders a service-provided follow-up with an unknown template ID", async () => {
    const data = createPracticeScenario("answeringFirstFollowUp")
    if (data.session.status !== "answeringFollowUp") return

    data.session.currentFollowUp.prompt = "后端新增追问模板返回的正文"

    renderReadyView(data)

    expect(await screen.findByText("后端新增追问模板返回的正文")).toBeInTheDocument()
    expect(screen.queryByText("backend.new-follow-up-template")).not.toBeInTheDocument()
  })

  it("submits the current follow-up with its exact answer content", async () => {
    const user = userEvent.setup()
    const data = createPracticeScenario("answeringSingleFollowUp")
    const actions = createFollowUpActions()
    renderReadyView(data, { followUpActions: actions })
    if (data.session.status !== "answeringFollowUp") return

    await user.type(
      await screen.findByLabelText(i18n.t("practice.followUp.answerLabel")),
      "我会把验证标准前置，并在关键节点主动同步风险。",
    )
    await user.click(screen.getByRole("button", { name: i18n.t("practice.followUp.submit") }))

    expect(actions.onSubmitFollowUp).toHaveBeenCalledWith(
      "我会把验证标准前置，并在关键节点主动同步风险。",
    )
  })

  it("shows three follow-up assistance entries without preloading hidden content", async () => {
    const data = createPracticeScenario("answeringSingleFollowUp")
    renderReadyView(data)
    if (data.session.status !== "answeringFollowUp") return

    const hintButton = await screen.findByRole("button", {
      name: i18n.t("practice.followUpAssistance.viewHint"),
    })
    const frameworkButton = screen.getByRole("button", {
      name: i18n.t("practice.followUpAssistance.viewFramework"),
    })
    const referenceButton = screen.getByRole("button", {
      name: i18n.t("practice.followUpAssistance.viewReference"),
    })
    expect(hintButton).toBeVisible()
    expect(frameworkButton).toBeVisible()
    expect(referenceButton).toBeVisible()
    expect(referenceButton).toHaveClass("self-start")
    expect(screen.getAllByTestId("practice-follow-up-guidance-card")).toHaveLength(2)
    expect(screen.getByTestId("practice-follow-up-reference")).toBeVisible()
    expect(
      new Set(
        [hintButton, frameworkButton, referenceButton].map((button) =>
          button.closest("[data-slot='card']"),
        ),
      ).size,
    ).toBe(3)
    expect(screen.queryByText(/承认具体不足|Profiler 确认更新来源/)).not.toBeInTheDocument()
  })

  it("reveals each follow-up aid in its own card and removes its request button", async () => {
    const data = createPracticeScenario("answeringSingleFollowUp")
    if (data.session.status !== "answeringFollowUp") return
    data.session.currentFollowUp.hints = {
      status: "revealed",
      content: ["追问提示内容"],
    }
    data.session.currentFollowUp.framework = {
      status: "revealed",
      content: ["回答思路内容"],
    }
    data.session.currentFollowUp.referenceAnswer = {
      status: "revealed",
      content: {
        kind: "personalizedSupplement",
        addressedGap: "需要补充的缺口",
        answer: "参考补充内容",
        keyPoints: ["参考关键点"],
        commonMistakes: ["参考常见误区"],
      },
      viewedBeforeSubmission: true,
    }
    renderReadyView(data)

    const [hintCard, frameworkCard] = await screen.findAllByTestId(
      "practice-follow-up-guidance-card",
    )
    const referenceCard = screen.getByTestId("practice-follow-up-reference")
    expect(hintCard).toHaveTextContent("追问提示内容")
    expect(frameworkCard).toHaveTextContent("回答思路内容")
    expect(referenceCard).toHaveTextContent("参考补充内容")
    expect(
      screen.queryByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewHint"),
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewFramework"),
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewReference"),
      }),
    ).not.toBeInTheDocument()
  })

  it("requests follow-up hint and framework with the exact input", async () => {
    const user = userEvent.setup()
    const data = createPracticeScenario("answeringSingleFollowUp")
    const actions = createFollowUpActions()
    renderReadyView(data, { followUpActions: actions })
    if (data.session.status !== "answeringFollowUp") return

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewHint"),
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewFramework"),
      }),
    )
    expect(actions.onRequestHint).toHaveBeenCalledWith()
    expect(actions.onRequestFramework).toHaveBeenCalledWith()
  })

  it("requests a follow-up reference only after confirmation and preserves the draft", async () => {
    const user = userEvent.setup()
    const data = createPracticeScenario("answeringSingleFollowUp")
    const actions = createFollowUpActions()
    renderReadyView(data, { followUpActions: actions })
    if (data.session.status !== "answeringFollowUp") return
    const textbox = await screen.findByLabelText(i18n.t("practice.followUp.answerLabel"))
    await user.type(textbox, "先保留这段追问草稿")

    await user.click(
      screen.getByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewReference"),
      }),
    )
    expect(actions.onRequestReferenceAnswer).not.toHaveBeenCalled()
    const dialog = screen.getByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", {
        name: i18n.t("practice.followUpAssistance.continueIndependently"),
      }),
    )
    expect(actions.onRequestReferenceAnswer).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewReference"),
      }),
    )
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: i18n.t("practice.followUpAssistance.confirm"),
      }),
    )
    expect(actions.onRequestReferenceAnswer).toHaveBeenCalledTimes(1)
    expect(actions.onRequestReferenceAnswer).toHaveBeenCalledWith()
    expect(textbox).toHaveValue("先保留这段追问草稿")
  })

  it("deduplicates same-frame follow-up reference confirmation", async () => {
    const user = userEvent.setup()
    let resolveRequest!: (result: "executed") => void
    const request = vi.fn(() => new Promise<"executed">((resolve) => (resolveRequest = resolve)))
    renderReadyView(createPracticeScenario("answeringSingleFollowUp"), {
      followUpActions: createFollowUpActions({ onRequestReferenceAnswer: request }),
    })
    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewReference"),
      }),
    )
    const confirm = within(screen.getByRole("alertdialog")).getByRole("button", {
      name: i18n.t("practice.followUpAssistance.confirm"),
    })
    await user.dblClick(confirm)
    expect(request).toHaveBeenCalledTimes(1)
    resolveRequest("executed")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  })

  it("locks every follow-up action during assistance while keeping the draft editable", async () => {
    renderReadyView(createPracticeScenario("answeringSingleFollowUp"), {
      followUpPending: {
        end: false,
        framework: false,
        hint: true,
        interactionLocked: true,
        referenceAnswer: false,
        submit: false,
      },
    })

    expect(
      await screen.findByRole("button", {
        name: i18n.t("practice.followUpAssistance.hintGenerating"),
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewFramework"),
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewReference"),
      }),
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: i18n.t("practice.followUp.submit") })).toBeDisabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.followUp.endAnswering") }),
    ).toBeDisabled()
    expect(screen.getByLabelText(i18n.t("practice.followUp.answerLabel"))).toBeEnabled()
  })

  it("shows only safe follow-up assistance errors and keeps the draft", async () => {
    const user = userEvent.setup()
    const actions = createFollowUpActions({
      onRequestHint: vi.fn(async () => {
        throw new Error("internal secret stack")
      }),
    })
    renderReadyView(createPracticeScenario("answeringSingleFollowUp"), {
      followUpActions: actions,
    })
    const textbox = await screen.findByLabelText(i18n.t("practice.followUp.answerLabel"))
    await user.type(textbox, "错误后保留草稿")
    await user.click(
      screen.getByRole("button", { name: i18n.t("practice.followUpAssistance.viewHint") }),
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.followUpAssistance.requestErrorDescription"),
    )
    expect(screen.queryByText(/secret|stack/)).not.toBeInTheDocument()
    expect(textbox).toHaveValue("错误后保留草稿")
  })

  it("resets follow-up assistance errors when the current follow-up changes", async () => {
    const user = userEvent.setup()
    const first = createPracticeScenario("answeringFirstFollowUp")
    const second = createPracticeScenario("answeringFollowUp")
    if (
      first.session.status !== "answeringFollowUp" ||
      second.session.status !== "answeringFollowUp"
    ) {
      throw new Error("Answering follow-up fixtures required.")
    }

    expect(second.session.currentFollowUp.hints.status).toBe("notRequested")
    expect(second.session.currentFollowUp.framework.status).toBe("notRequested")
    expect(second.session.currentFollowUp.referenceAnswer.status).toBe("notRequested")

    const actions = createFollowUpActions({
      onRequestHint: vi.fn(async () => {
        throw new Error("internal secret stack")
      }),
    })
    const { rerenderReady } = renderReadyView(first, { followUpActions: actions })

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewHint"),
      }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("practice.followUpAssistance.requestErrorDescription"),
    )
    expect(screen.queryByText(/secret|stack/)).not.toBeInTheDocument()

    rerenderReady(second)

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument())
    expect(
      screen.getByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewHint"),
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewFramework"),
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewReference"),
      }),
    ).toBeVisible()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(screen.getByLabelText(i18n.t("practice.followUp.answerLabel"))).toBeEnabled()
  })

  it("resets the reference confirmation dialog when the current follow-up changes", async () => {
    const user = userEvent.setup()
    const first = createPracticeScenario("answeringFirstFollowUp")
    const second = createPracticeScenario("answeringFollowUp")
    if (
      first.session.status !== "answeringFollowUp" ||
      second.session.status !== "answeringFollowUp"
    ) {
      throw new Error("Answering follow-up fixtures required.")
    }
    const actions = createFollowUpActions()
    const { rerenderReady } = renderReadyView(first, { followUpActions: actions })

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewReference"),
      }),
    )
    expect(screen.getByRole("alertdialog")).toBeVisible()
    expect(actions.onRequestReferenceAnswer).not.toHaveBeenCalled()

    rerenderReady(second)

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("practice.followUpAssistance.viewReference"),
      }),
    )
    expect(screen.getByRole("alertdialog")).toBeVisible()
    expect(actions.onRequestReferenceAnswer).not.toHaveBeenCalled()
  })

  it("preserves a follow-up draft after a safe submit error", async () => {
    const user = userEvent.setup()
    const actions = createFollowUpActions({
      onSubmitFollowUp: vi.fn(async () => {
        throw new Error("unsafe details")
      }),
    })
    renderReadyView(createPracticeScenario("answeringSingleFollowUp"), {
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
    renderReadyView(createPracticeScenario("answeringSingleFollowUp"), {
      followUpPending: {
        end: false,
        framework: false,
        hint: false,
        interactionLocked: true,
        referenceAnswer: false,
        submit: true,
      },
    })

    expect(await screen.findByText(i18n.t("practice.followUp.processing"))).toBeVisible()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.followUp.submitting") }),
    ).toBeDisabled()
    expect(screen.getByLabelText(i18n.t("practice.followUp.answerLabel"))).toBeDisabled()
  })

  it("requires an explicit confirmation before ending an unanswered follow-up", async () => {
    const user = userEvent.setup()
    const data = createPracticeScenario("answeringSingleFollowUp")
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

    expect(actions.onEndFollowUps).toHaveBeenCalledWith()
  })

  it("keeps the completed timeline visible while scoring is pending", async () => {
    const data = createPracticeScenario("evaluatingNoFollowUp")
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
    const data = createPracticeScenario("evaluatingFollowUpEndedEarly")
    renderReadyView(data)
    if (
      data.session.status !== "evaluating" ||
      data.session.followUpCompletion.status !== "endedEarly"
    ) {
      return
    }

    const timeline = await screen.findByTestId("practice-conversation-timeline")
    const answered = data.session.followUps[0]
    if (!answered) throw new Error("The ended-early fixture must contain an answered follow-up.")
    const unanswered = data.session.followUpCompletion.unanswered
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
      i18n.t("practice.followUp.unansweredFollowUp", { count: data.session.followUps.length + 1 }),
    )
    expect(timeline).not.toHaveTextContent(
      i18n.t("practice.followUp.yourFollowUpAnswer", { count: data.session.followUps.length + 1 }),
    )
    expect(screen.queryByLabelText(i18n.t("practice.followUp.answerLabel"))).not.toBeInTheDocument()
  })

  it("shows a safe evaluation error and retries without losing the conversation", async () => {
    const user = userEvent.setup()
    const data = createPracticeScenario("evaluatingAnswer")
    const onRetryEvaluation = vi.fn()
    renderReadyView(data, { evaluationError: true, onRetryEvaluation })
    if (data.session.status !== "evaluating") return

    expect(await screen.findByTestId("practice-conversation-timeline")).toHaveTextContent(
      data.session.mainAnswer.content,
    )
    const error = screen.getByTestId("practice-evaluation-error")
    expect(error).toHaveTextContent(i18n.t("practice.errors.evaluationDescription"))
    expect(error).not.toHaveTextContent("stack trace")
    await user.click(screen.getByRole("button", { name: i18n.t("practice.evaluating.retry") }))
    expect(onRetryEvaluation).toHaveBeenCalledOnce()
  })

  it("renders all eight score dimensions with response explanations", async () => {
    const data = createPracticeScenario("reviewBalanced")
    if (data.session.status !== "review") throw new Error("Expected review fixture.")
    const score = data.session.evaluation.dimensionScores[0]!
    data.session.evaluation.dimensionScores = (
      [
        "relevance",
        "structure",
        "specificity",
        "personalContribution",
        "resultsAndEvidence",
        "roleAlignment",
        "communication",
        "riskControl",
      ] as const
    ).map((dimension) => ({ ...score, dimension }))
    renderReadyView(data)

    const dimensions = await screen.findByTestId("practice-dimension-scores")
    for (const item of data.session.evaluation.dimensionScores) {
      expect(dimensions).toHaveTextContent(i18n.t(`practice.scoreDimensions.${item.dimension}`))
      expect(dimensions).toHaveTextContent(item.explanation)
      expect(dimensions).toHaveTextContent(
        i18n.t("practice.review.dimensionScore", { score: item.score }),
      )
    }
  })

  it("keeps highlights, issues, improvements, structure, and weaknesses in distinct sections", async () => {
    const data = createPracticeScenario("reviewRetryRecommended")
    renderReadyView(data)
    if (data.session.status !== "review") return

    const review = await screen.findByTestId("practice-review-state")
    for (const item of data.session.review.highlights) expect(review).toHaveTextContent(item)
    for (const item of data.session.review.mainIssues) expect(review).toHaveTextContent(item)
    for (const item of data.session.review.improvementSuggestions)
      expect(review).toHaveTextContent(item)
    for (const item of data.session.review.exposedWeaknesses) expect(review).toHaveTextContent(item)
    expect(screen.getByTestId("practice-reusable-structure")).toHaveTextContent(
      i18n.t("practice.review.reusableStructureDescription"),
    )
  })

  it("shows retry and next-question recommendations directly from the response", async () => {
    const retry = createPracticeScenario("reviewRetryRecommended")
    const { unmount } = renderReadyView(retry)
    if (retry.session.status !== "review") return
    expect(await screen.findByTestId("practice-recommendation")).toHaveTextContent(
      retry.session.review.recommendation.reason,
    )
    expect(screen.getByTestId("practice-recommendation")).toHaveTextContent(
      i18n.t("practice.review.retryRecommended"),
    )
    unmount()

    const next = createPracticeScenario("reviewNextRecommended")
    renderReadyView(next)
    if (
      next.session.status !== "review" ||
      next.session.review.recommendation.action !== "nextQuestion"
    )
      return
    const recommendation = await screen.findByTestId("practice-recommendation")
    expect(recommendation).toHaveTextContent(next.session.review.recommendation.reason)
    expect(recommendation).toHaveTextContent(
      i18n.t(
        `practice.questionTypes.${next.session.review.recommendation.nextQuestion.questionType}`,
      ),
    )
  })

  it("exposes implemented review lifecycle actions alongside saved and weak actions", async () => {
    const data = createPracticeScenario("reviewBalanced")
    renderReadyView(data)

    await screen.findByTestId("practice-review-state")
    expect(screen.getByRole("button", { name: /重练当前题|retry current question/i })).toBeEnabled()
    expect(
      screen.getByRole("button", { name: /继续下一题|continue to next question/i }),
    ).toBeEnabled()
    expect(screen.getByRole("button", { name: /结束本轮练习|end this session/i })).toBeEnabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionActions.save") }),
    ).toBeEnabled()
    expect(
      screen.getByRole("button", { name: i18n.t("practice.questionActions.markWeak") }),
    ).toBeEnabled()
  })

  it("keeps the complete read-only conversation in the review context", async () => {
    const data = createPracticeScenario("reviewFollowUpEndedEarly")
    renderReadyView(data)
    if (
      data.session.status !== "review" ||
      data.session.followUpCompletion.status !== "endedEarly"
    ) {
      return
    }

    const timeline = await screen.findByTestId("practice-conversation-timeline")
    expect(timeline).toHaveTextContent(data.session.question.prompt)
    expect(timeline).toHaveTextContent(data.session.mainAnswer.content)
    for (const exchange of data.session.followUps) {
      expect(timeline).toHaveTextContent(exchange.question.prompt)
      expect(timeline).toHaveTextContent(exchange.answer.content)
    }
    expect(timeline).toHaveTextContent(data.session.followUpCompletion.unanswered.prompt)
    expect(screen.queryByLabelText(i18n.t("practice.followUp.answerLabel"))).not.toBeInTheDocument()
    const review = screen.getByTestId("practice-follow-up-review")
    expect(review).toHaveTextContent(i18n.t("practice.followUpAssistance.unanswered"))
    const expandButtons = within(review).getAllByRole("button", {
      name: i18n.t("practice.followUpReview.expandReference"),
    })
    await userEvent.click(expandButtons.at(-1)!)
    expect(review).toHaveTextContent(
      data.session.followUpCompletion.unanswered.referenceAnswer.status === "revealed"
        ? data.session.followUpCompletion.unanswered.referenceAnswer.content.addressedGap
        : "",
    )
  })

  it("renders long review content and the no-new-weaknesses state", async () => {
    const long = createPracticeScenario("reviewLongContent")
    const { unmount } = renderReadyView(long)
    if (long.session.status !== "review") return
    expect(await screen.findByTestId("practice-review-state")).toHaveTextContent(
      long.session.review.overallPerformance,
    )
    unmount()

    renderReadyView(createPracticeScenario("reviewNoNewWeaknesses"))
    expect(await screen.findByText(i18n.t("practice.review.noNewWeaknesses"))).toBeVisible()
  })
})
