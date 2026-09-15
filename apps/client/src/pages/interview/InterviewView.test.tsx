import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { createInterviewSetupStoryFixture } from "./stories/interview-story-fixtures"
import type { InterviewConfiguration, InterviewSetup } from "@/models/interview-workflow"
import { renderWithProviders } from "@/test/render"

import { InterviewView } from "./InterviewView"

function renderReadyView(
  onStart: (input: InterviewConfiguration) => Promise<void> = vi.fn(async () => undefined),
  isStarting = false,
  setup: InterviewSetup = createInterviewSetupStoryFixture(),
) {
  return {
    onStart,
    ...renderWithProviders(
      <InterviewView
        isStarting={isStarting}
        onStart={onStart}
        setup={structuredClone(setup)}
        status="ready"
      />,
      { router: { initialEntries: ["/interview"] } },
    ),
  }
}

describe("InterviewView", () => {
  it("keeps the header and setup-card structure visible while loading", async () => {
    renderWithProviders(<InterviewView status="loading" />, {
      router: { initialEntries: ["/interview"] },
    })

    expect(
      await screen.findByRole("heading", { name: i18n.t("interview.title") }),
    ).toBeInTheDocument()
    expect(screen.getByText(i18n.t("interview.setup.title"))).toBeInTheDocument()
    const loadingState = screen.getByTestId("interview-loading-state")
    expect(loadingState).toHaveAttribute("aria-busy", "true")
    expect(loadingState.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(7)
    expect(screen.queryByText(i18n.t("interview.setup.fields.role"))).not.toBeInTheDocument()
    expect(
      screen.queryByText(i18n.t("interview.setup.fields.interviewType")),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("interview.setup.fields.difficulty"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("interview.setup.fields.duration"))).not.toBeInTheDocument()
  })

  it("renders service-provided roles, types, difficulties, and duration preferences", async () => {
    renderReadyView()

    const setupCard = (await screen.findByText(i18n.t("interview.setup.title"))).closest(
      '[data-slot="card"]',
    )
    expect(setupCard?.parentElement).toHaveClass("w-full")
    expect(setupCard?.parentElement).not.toHaveClass("max-w-4xl")

    expect(await screen.findByText("Senior Frontend Engineer · ByteDance")).toBeInTheDocument()
    for (const interviewType of createInterviewSetupStoryFixture().roles[0]
      .supportedInterviewTypes) {
      expect(
        screen.getByRole("button", { name: i18n.t(`interview.types.${interviewType}`) }),
      ).toBeVisible()
    }
    for (const difficulty of createInterviewSetupStoryFixture().availableDifficulties) {
      expect(
        screen.getByRole("button", { name: i18n.t(`interview.difficulty.${difficulty}`) }),
      ).toBeVisible()
    }
    for (const durationMinutes of createInterviewSetupStoryFixture().availableDurationMinutes) {
      expect(
        screen.getByRole("button", {
          name: i18n.t("interview.setup.durationMinutes", { minutes: durationMinutes }),
        }),
      ).toBeVisible()
    }
  })

  it("preserves professional interviews when switching to a non-developer role", async () => {
    const user = userEvent.setup()
    renderReadyView(undefined, false, createInterviewSetupStoryFixture("multipleRolesReady"))

    await user.click(await screen.findByTestId("interview-role-trigger"))
    await user.click(await screen.findByRole("option", { name: "Product Manager · Meituan" }))

    expect(
      screen.queryByRole("button", { name: i18n.t("interview.types.professional") }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("interview.types.professional") }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("keeps setup dividers spaced without doubling the footer gap", async () => {
    renderReadyView()

    const roleField = (await screen.findByText(i18n.t("interview.setup.fields.role"))).closest(
      '[data-slot="field"]',
    )
    expect(roleField).toHaveClass("pb-5")

    const interviewTypeFieldSet = screen
      .getByText(i18n.t("interview.setup.fields.interviewType"))
      .closest('[data-slot="field-set"]')
    expect(interviewTypeFieldSet?.parentElement).toHaveClass("border-t", "border-border", "py-5")

    const difficultyFieldSet = screen
      .getByText(i18n.t("interview.setup.fields.difficulty"))
      .closest('[data-slot="field-set"]')
    expect(difficultyFieldSet?.parentElement).toHaveClass(
      "border-t",
      "border-border",
      "gap-5",
      "pt-5",
    )
    expect(difficultyFieldSet?.parentElement).not.toHaveClass("py-5", "pb-5")

    const durationFieldSet = screen
      .getByText(i18n.t("interview.setup.fields.duration"))
      .closest('[data-slot="field-set"]')
    expect(durationFieldSet?.parentElement).toHaveClass("border-t", "border-border", "pt-5")
  })

  it("submits the selected configuration once", async () => {
    const user = userEvent.setup()
    const { onStart } = renderReadyView()

    const startButton = await screen.findByRole("button", {
      name: i18n.t("interview.actions.start"),
    })
    expect(startButton.closest('[data-slot="card-footer"]')).not.toHaveClass("border-t")
    await user.click(startButton)

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStart).toHaveBeenCalledWith(createInterviewSetupStoryFixture().defaultConfiguration)
  })

  it("submits the duration preference without converting it into a question count", async () => {
    const user = userEvent.setup()
    const { onStart } = renderReadyView()

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("interview.setup.durationMinutes", { minutes: 45 }),
      }),
    )
    await user.click(screen.getByRole("button", { name: i18n.t("interview.actions.start") }))

    expect(onStart).toHaveBeenCalledWith({
      ...createInterviewSetupStoryFixture().defaultConfiguration,
      durationMinutes: 45,
    })
  })

  it("disables all setup controls while starting", async () => {
    renderReadyView(undefined, true)

    expect(
      await screen.findByRole("button", { name: i18n.t("interview.actions.starting") }),
    ).toBeDisabled()
    expect(screen.getByRole("combobox")).toBeDisabled()
    for (const toggle of screen
      .getAllByRole("button")
      .filter((button) => button.dataset.slot === "toggle-group-item")) {
      expect(toggle).toBeDisabled()
    }
  })

  it("shows a retryable form-level error after starting fails", async () => {
    const user = userEvent.setup()
    const onStart = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce(undefined)
    renderReadyView(onStart)

    await user.click(await screen.findByRole("button", { name: i18n.t("interview.actions.start") }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("interview.errors.startTitle"),
    )

    await user.click(screen.getByRole("button", { name: i18n.t("interview.actions.start") }))
    expect(onStart).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("renders an empty state with a role navigation action", async () => {
    renderWithProviders(<InterviewView status="empty" />, {
      router: { initialEntries: ["/interview"] },
    })

    expect(await screen.findByText(i18n.t("interview.empty.title"))).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("interview.actions.addRole") }),
    ).toHaveAttribute("href", "/roles")
  })

  it("renders a load error and calls retry", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderWithProviders(<InterviewView isRetrying={false} onRetry={onRetry} status="error" />, {
      router: { initialEntries: ["/interview"] },
    })

    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("interview.errors.loadTitle"))
    await user.click(screen.getByRole("button", { name: i18n.t("interview.actions.retry") }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
