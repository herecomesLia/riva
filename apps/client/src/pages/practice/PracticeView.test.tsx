import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createPracticeMockResponse } from "@/mocks/data/practice"
import type { ActivePracticeSelection, PracticePageResponse } from "@/models/practice"
import { renderWithProviders } from "@/test/render"

import { PracticeView } from "./PracticeView"

function renderReadyView(
  data: PracticePageResponse,
  options: {
    generationError?: boolean
    isStarting?: boolean
    onRetryGeneration?: () => void
    onStart?: (input: ActivePracticeSelection) => Promise<void>
  } = {},
) {
  const onStart = options.onStart ?? vi.fn(async () => undefined)
  renderWithProviders(
    <PracticeView
      content={{ status: "ready", data }}
      generationError={options.generationError ?? false}
      isStarting={options.isStarting ?? false}
      onRetryGeneration={options.onRetryGeneration ?? vi.fn()}
      onStart={onStart}
      variant="default"
    />,
    { router: { initialEntries: ["/practice"] } },
  )
  return { onStart }
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
})
