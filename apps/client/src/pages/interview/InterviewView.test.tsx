import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { interviewSetupResponseMock } from "@/mocks/data/interview"
import type { InterviewConfiguration } from "@/models/interview"
import { renderWithProviders } from "@/test/render"

import { InterviewView } from "./InterviewView"

function renderReadyView(
  onStart: (input: InterviewConfiguration) => Promise<void> = vi.fn(async () => undefined),
  isStarting = false,
) {
  return {
    onStart,
    ...renderWithProviders(
      <InterviewView
        isStarting={isStarting}
        onStart={onStart}
        setup={structuredClone(interviewSetupResponseMock)}
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
    expect(screen.getByText(i18n.t("interview.setup.fields.targetRole"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("interview.setup.fields.round"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("interview.setup.fields.difficulty"))).toBeInTheDocument()
    expect(screen.getByTestId("interview-loading-state")).toHaveAttribute("aria-busy", "true")
  })

  it("renders service-provided roles, rounds, and difficulties", async () => {
    renderReadyView()

    expect(await screen.findByText("高级前端工程师 · 字节跳动")).toBeInTheDocument()
    for (const round of interviewSetupResponseMock.targetRoles[0].supportedRounds) {
      expect(
        screen.getByRole("button", { name: i18n.t(`interview.rounds.${round}`) }),
      ).toBeVisible()
    }
    for (const difficulty of interviewSetupResponseMock.availableDifficulties) {
      expect(
        screen.getByRole("button", { name: i18n.t(`interview.difficulty.${difficulty}`) }),
      ).toBeVisible()
    }
  })

  it("updates available rounds when the selected service role changes", async () => {
    const user = userEvent.setup()
    renderReadyView()

    await user.click(await screen.findByTestId("interview-target-role-trigger"))
    await user.click(await screen.findByRole("option", { name: "金融科技产品经理 · 蚂蚁集团" }))

    expect(
      screen.queryByRole("button", { name: i18n.t("interview.rounds.technical") }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: i18n.t("interview.rounds.hr") })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })

  it("submits the selected configuration once", async () => {
    const user = userEvent.setup()
    const { onStart } = renderReadyView()

    await user.click(await screen.findByRole("button", { name: i18n.t("interview.actions.start") }))

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStart).toHaveBeenCalledWith(interviewSetupResponseMock.defaultConfiguration)
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

  it("renders an empty state with a target-role navigation action", async () => {
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
