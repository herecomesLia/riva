import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { TargetedPracticeHistoryView } from "@/pages/history"
import {
  completedTargetedPracticeHistoryStoryFixture,
  endedTargetedPracticeHistoryStoryFixture,
  partialTargetedPracticeHistoryStoryFixture,
} from "@/pages/history/stories/targeted-practice-history-story-fixtures"
import { renderWithProviders } from "@/test/render"

function renderView(
  state: React.ComponentProps<typeof TargetedPracticeHistoryView>["state"],
  onRetry = vi.fn(),
) {
  return renderWithProviders(<TargetedPracticeHistoryView onRetry={onRetry} state={state} />, {
    router: { initialEntries: ["/history/practice/record"] },
  })
}

describe("TargetedPracticeHistoryView", () => {
  it("keeps the page and section headings visible while loading", async () => {
    renderView({ status: "loading" })

    expect(
      await screen.findByRole("heading", { level: 1, name: i18n.t("history.detail.title") }),
    ).toBeInTheDocument()
    expect(screen.getByText(i18n.t("history.detail.summaryTitle"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("history.detail.questionsTitle"))).toBeInTheDocument()
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("renders all main attempts, retry snapshots, follow-ups, and ready references", async () => {
    const record = completedTargetedPracticeHistoryStoryFixture
    renderView({ status: "ready", data: record })

    expect(await screen.findAllByText(record.questions[0].prompt)).toHaveLength(2)
    expect(screen.getByText(i18n.t("history.detail.retryAttempt"))).toBeInTheDocument()
    expect(screen.getByText(record.questions[1].followUps[0].prompt)).toBeInTheDocument()
    expect(screen.getAllByTestId("history-reference-ready").length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText(i18n.t("history.detail.saved"))).toHaveLength(2)
  })

  it("keeps reference answers visible for unanswered follow-ups and real snapshot states", async () => {
    renderView({ status: "ready", data: partialTargetedPracticeHistoryStoryFixture })

    expect(await screen.findByText(i18n.t("history.detail.unanswered"))).toBeInTheDocument()
    expect(screen.getByTestId("history-reference-generating")).toBeInTheDocument()
    expect(screen.getByTestId("history-reference-unavailable")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("history.detail.reference.generate") }),
    ).toHaveAttribute("href", "/practice")
  })

  it("offers example-answer navigation for an unanswered early-ended question", async () => {
    renderView({ status: "ready", data: endedTargetedPracticeHistoryStoryFixture })

    expect(await screen.findByText(i18n.t("history.detail.unanswered"))).toBeInTheDocument()
    expect(screen.getByTestId("history-reference-notRequested")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: i18n.t("history.detail.reference.generate") }),
    ).toHaveAttribute("href", "/practice")
  })

  it("renders distinct not-found and retryable error states", async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    const { rerender } = renderView({ status: "error" }, onRetry)

    await user.click(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )
    expect(onRetry).toHaveBeenCalledOnce()

    rerender(<TargetedPracticeHistoryView onRetry={onRetry} state={{ status: "notFound" }} />)
    const link = await screen.findByRole("button", {
      name: i18n.t("history.detail.notFound.action"),
    })
    expect(link).toHaveAttribute("href", "/history")
  })
})
