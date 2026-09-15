import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { TargetedPracticeHistoryView } from "@/pages/history"
import { defaultHistorySearch } from "@/pages/history/history-navigation"
import {
  completedTargetedPracticeHistoryStoryFixture,
  endedTargetedPracticeHistoryStoryFixture,
  partialTargetedPracticeHistoryStoryFixture,
} from "@/pages/history/stories/targeted-practice-history-story-fixtures"
import { renderWithProviders } from "@/test/render"

function renderView(
  state: React.ComponentProps<typeof TargetedPracticeHistoryView>["state"],
  onRetry = vi.fn(),
  onGenerateReferenceAnswer = vi.fn(),
) {
  return renderWithProviders(
    <TargetedPracticeHistoryView
      historySearch={defaultHistorySearch}
      onGenerateReferenceAnswer={onGenerateReferenceAnswer}
      onRetry={onRetry}
      state={state}
    />,
    {
      router: { initialEntries: ["/history/practice/record"] },
    },
  )
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
    expect(
      screen.getAllByRole("button", {
        name: i18n.t("history.detail.reference.title"),
      }).length,
    ).toBeGreaterThanOrEqual(2)
    const savedBadges = screen.getAllByText(i18n.t("history.detail.saved"))
    expect(savedBadges).toHaveLength(2)
    expect(savedBadges[0].querySelector(".lucide-bookmark")).toHaveClass(
      "fill-destructive",
      "text-destructive",
    )
    const retryLink = screen.getByRole("button", { name: i18n.t("history.detail.retry") })
    const retryHref = retryLink.getAttribute("href") ?? ""
    expect(retryHref).toContain("entry=history")
    expect(retryHref).toContain(`roleId=${encodeURIComponent(record.role.id)}`)
    expect(retryHref).toContain(`difficulty=${record.setup.difficulty}`)
    expect(retryHref).toContain(`source=${record.setup.source}`)
    expect(retryHref).toContain(
      `prioritizeWeaknesses=${String(record.setup.prioritizedWeaknesses)}`,
    )
    expect(retryHref).not.toMatch(/recordId=|sessionId=|version=|viewData=/)
    const recommendationLink = screen.getByRole("link", {
      name: i18n.t("history.detail.recommendationActions.mockInterview"),
    })
    const recommendationHref = recommendationLink.getAttribute("href") ?? ""
    expect(recommendationHref).toContain("/interview?")
    expect(recommendationHref).toContain(`roleId=${encodeURIComponent(record.role.id)}`)
    expect(recommendationHref).toContain(`interviewType=${record.recommendation!.interviewType}`)
    expect(recommendationHref).not.toMatch(/recordId=|sessionId=|version=|viewData=/)
  })

  it("collapses score details and reference answers independently by default", async () => {
    const user = userEvent.setup()
    const record = completedTargetedPracticeHistoryStoryFixture
    const question = record.questions[0]
    renderView({ status: "ready", data: record })

    const questionCard = await screen.findByTestId(`history-question-${question.id}`)
    const scoreButton = within(questionCard).getByRole("button", {
      name: i18n.t("history.detail.evaluationDetails"),
    })
    const referenceButton = within(questionCard).getByRole("button", {
      name: i18n.t("history.detail.reference.title"),
    })

    expect(scoreButton).toHaveAttribute("aria-expanded", "false")
    expect(referenceButton).toHaveAttribute("aria-expanded", "false")
    expect(scoreButton).not.toHaveClass("aria-expanded:bg-muted")
    expect(referenceButton).not.toHaveClass("aria-expanded:bg-muted")

    await user.click(scoreButton)

    expect(scoreButton).toHaveAttribute("aria-expanded", "true")
    expect(referenceButton).toHaveAttribute("aria-expanded", "false")
    expect(
      within(questionCard).getByRole("heading", {
        name: i18n.t("history.detail.evaluation"),
      }),
    ).toBeVisible()

    await user.click(referenceButton)

    expect(scoreButton).toHaveAttribute("aria-expanded", "true")
    expect(referenceButton).toHaveAttribute("aria-expanded", "true")
    expect(within(questionCard).getByTestId("history-reference-unavailable")).toBeVisible()
  })

  it("reveals reference snapshots for unanswered follow-ups and real snapshot states", async () => {
    const user = userEvent.setup()
    const onGenerate = vi.fn()
    renderView(
      { status: "ready", data: partialTargetedPracticeHistoryStoryFixture },
      vi.fn(),
      onGenerate,
    )

    expect(await screen.findByText(i18n.t("history.detail.unanswered"))).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("history.detail.weak")).querySelector(".lucide-flag"),
    ).toHaveClass("fill-orange-500", "text-orange-500")
    expect(
      screen.getByRole("link", {
        name: i18n.t("history.detail.recommendationActions.retryQuestion"),
      }),
    ).toHaveAttribute("href", expect.stringContaining("questionType=behavioral"))
    for (const button of screen.getAllByRole("button", {
      name: i18n.t("history.detail.reference.title"),
    })) {
      await user.click(button)
    }
    expect(screen.getByTestId("history-reference-generating")).toBeInTheDocument()
    expect(screen.getByTestId("history-reference-notRequested")).toBeInTheDocument()
    const generateButton = screen
      .getAllByRole("button", { name: i18n.t("history.detail.reference.generate") })
      .find((button) => !button.hasAttribute("disabled"))
    if (!generateButton) throw new Error("Expected an enabled reference generation action.")
    await user.click(generateButton)
    expect(onGenerate).toHaveBeenCalledOnce()
  })

  it("offers example-answer navigation for an unanswered early-ended question", async () => {
    const user = userEvent.setup()
    const onGenerate = vi.fn()
    renderView(
      { status: "ready", data: endedTargetedPracticeHistoryStoryFixture },
      vi.fn(),
      onGenerate,
    )

    expect(await screen.findByText(i18n.t("history.detail.unanswered"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("history.detail.recommendationNone"))).toBeInTheDocument()
    for (const action of ["retryQuestion", "targetedPractice", "mockInterview"] as const) {
      expect(
        screen.queryByRole("link", {
          name: i18n.t(`history.detail.recommendationActions.${action}`),
        }),
      ).not.toBeInTheDocument()
    }
    await user.click(screen.getByRole("button", { name: i18n.t("history.detail.reference.title") }))
    expect(screen.getByTestId("history-reference-notRequested")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: i18n.t("history.detail.reference.generate") }),
    )
    expect(onGenerate).toHaveBeenCalledWith({
      subject: "mainQuestion",
      questionId: endedTargetedPracticeHistoryStoryFixture.questions[0].id,
    })
  })

  it("renders distinct not-found and retryable error states", async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus")
    const { rerender } = renderView({ status: "error", isRetrying: false }, onRetry)

    await user.click(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )
    expect(onRetry).toHaveBeenCalledOnce()

    rerender(
      <TargetedPracticeHistoryView
        historySearch={defaultHistorySearch}
        onRetry={onRetry}
        state={{ status: "notFound" }}
      />,
    )
    expect(screen.getByTestId("targeted-history-state-region")).toHaveFocus()
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    focusSpy.mockRestore()
    const link = await screen.findByRole("button", {
      name: i18n.t("history.detail.notFound.action"),
    })
    expect(link).toHaveAttribute("href", expect.stringContaining("/history?"))
  })
})
