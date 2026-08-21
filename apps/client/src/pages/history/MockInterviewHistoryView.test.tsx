import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { MockInterviewHistoryView } from "@/pages/history"
import { defaultHistorySearch } from "@/pages/history/history-navigation"
import {
  completeMockInterviewHistoryStoryFixture,
  partialMockInterviewHistoryStoryFixture,
  unavailableReviewMockInterviewHistoryStoryFixture,
} from "@/pages/history/stories/mock-interview-history-story-fixtures"
import { renderWithProviders } from "@/test/render"

function renderView(
  state: React.ComponentProps<typeof MockInterviewHistoryView>["state"],
  onRetry = vi.fn(),
  onGenerateReferenceAnswer = vi.fn(),
) {
  return renderWithProviders(
    <MockInterviewHistoryView
      historySearch={defaultHistorySearch}
      onGenerateReferenceAnswer={onGenerateReferenceAnswer}
      onRetry={onRetry}
      state={state}
    />,
    {
      router: { initialEntries: ["/history/interview/record"] },
    },
  )
}

describe("MockInterviewHistoryView", () => {
  it("keeps the page, review, and question headings visible while loading", async () => {
    renderView({ status: "loading" })

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: i18n.t("history.mockDetail.title"),
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(i18n.t("history.mockDetail.summaryTitle"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("history.mockDetail.reviewTitle"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("history.mockDetail.questionsTitle"))).toBeInTheDocument()
  })

  it("renders a complete review, all questions and follow-ups, and candidate feedback", async () => {
    const record = completeMockInterviewHistoryStoryFixture
    renderView({ status: "ready", data: record })

    const overallSummary = await screen.findByText(record.overallReview.content!.summary)
    expect(overallSummary).toHaveClass("w-full", "min-w-0")
    expect(overallSummary).not.toHaveClass("max-w-prose")
    expect(screen.getByText(record.overallReview.content!.mainStrengths[0])).toHaveClass(
      "min-w-0",
      "flex-1",
    )
    expect(screen.getByText(record.questions[0].prompt)).toBeInTheDocument()
    expect(screen.getByText(record.questions[1].prompt)).toBeInTheDocument()
    expect(screen.getByText(record.questions[1].followUps[0].prompt)).toBeInTheDocument()
    expect(screen.getByText(record.candidateQuestionExchanges[0].question)).toBeInTheDocument()
    expect(screen.getByText(record.candidateQuestionExchanges[0].feedback)).toBeInTheDocument()
    expect(screen.getByText(i18n.t("history.mockDetail.disclaimer"))).toBeVisible()
    expect(screen.getByText(i18n.t("history.mockDetail.recommendedFocus"))).toBeVisible()
    expect(
      screen.queryByText(/HR回答|公司回答|面试官回答|HR answer|company answer|interviewer answer/i),
    ).not.toBeInTheDocument()
    const retryLink = screen.getByRole("button", { name: i18n.t("history.mockDetail.retry") })
    const retryHref = retryLink.getAttribute("href") ?? ""
    expect(retryHref).toContain("entry=history")
    expect(retryHref).toContain(`targetRoleId=${encodeURIComponent(record.targetRole.id)}`)
    expect(retryHref).toContain(`round=${record.setup.round}`)
    expect(retryHref).toContain(`difficulty=${record.setup.difficulty}`)
    expect(retryHref).toContain(`durationMinutes=${record.setup.plannedDurationMinutes}`)
    expect(retryHref).not.toMatch(/recordId=|sessionId=|version=|viewData=/)
    const recommendationLink = screen.getByRole("link", {
      name: i18n.t("history.detail.recommendationActions.targetedPractice"),
    })
    const recommendationHref = recommendationLink.getAttribute("href") ?? ""
    expect(recommendationHref).toContain("/practice?")
    expect(recommendationHref).toContain(`targetRoleId=${encodeURIComponent(record.targetRole.id)}`)
    expect(recommendationHref).toContain("questionType=technicalFoundation")
    expect(recommendationHref).not.toMatch(/recordId=|sessionId=|version=|viewData=/)
  })

  it("lets a single candidate analysis use the full review width", async () => {
    const record = structuredClone(completeMockInterviewHistoryStoryFixture)
    const exchange = record.candidateQuestionExchanges[0]
    if (!exchange) throw new Error("Candidate question fixture required.")
    exchange.feedback = ""

    renderView({ status: "ready", data: record })

    const recommendedFocus = await screen.findByText(exchange.interviewerAnswer)
    const alert = recommendedFocus.closest('[data-slot="alert"]')
    if (!alert) throw new Error("Recommended focus alert required.")
    expect(alert).toHaveClass("min-w-0", "md:col-span-2")
    expect(alert.closest('[data-slot="card-content"]')).toHaveClass("min-w-0", "md:grid-cols-2")
  })

  it("keeps unanswered questions and reference actions in a partial early-ended review", async () => {
    const record = partialMockInterviewHistoryStoryFixture
    const onGenerate = vi.fn()
    const user = userEvent.setup()
    renderView({ status: "ready", data: record }, vi.fn(), onGenerate)

    expect(await screen.findAllByText(i18n.t("history.mockDetail.partialReview"))).toHaveLength(2)
    expect(screen.getByText(record.questions[1].prompt)).toBeInTheDocument()
    expect(screen.getByText(record.questions[0].followUps[0].prompt)).toBeInTheDocument()
    expect(screen.getAllByText(i18n.t("interview.review.unanswered"))).not.toHaveLength(0)
    expect(screen.getByTestId("history-reference-unavailable")).toBeInTheDocument()
    for (const button of screen.getAllByRole("button", {
      name: i18n.t("history.detail.reference.generate"),
    })) {
      expect(button).not.toHaveAttribute("href")
      await user.click(button)
    }
    expect(onGenerate).toHaveBeenCalled()
  })

  it("shows existing questions and ready references when the overall review is unavailable", async () => {
    const record = unavailableReviewMockInterviewHistoryStoryFixture
    renderView({ status: "ready", data: record })

    expect(
      await screen.findByText(i18n.t("history.mockDetail.unavailableReview")),
    ).toBeInTheDocument()
    expect(screen.getByText(record.questions[0].prompt)).toBeInTheDocument()
    expect(screen.getByTestId("history-reference-ready")).toBeInTheDocument()
    expect(
      screen.getByText(record.questions[0].referenceAnswer.content!.exampleAnswer),
    ).toBeInTheDocument()
  })

  it("renders generating reference state independently of answer availability", async () => {
    renderView({ status: "ready", data: completeMockInterviewHistoryStoryFixture })

    expect(await screen.findByTestId("history-reference-generating")).toBeInTheDocument()
  })

  it("renders distinct not-found and retryable error states", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus")
    const { rerender } = renderView({ status: "error", isRetrying: false }, onRetry)

    await user.click(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )
    expect(onRetry).toHaveBeenCalledOnce()

    rerender(
      <MockInterviewHistoryView
        historySearch={defaultHistorySearch}
        onRetry={onRetry}
        state={{ status: "notFound" }}
      />,
    )
    const stateRegion = screen.getByTestId("mock-history-state-region")
    expect(stateRegion).toHaveFocus()
    expect(stateRegion).not.toHaveClass("focus-visible:ring-3", "focus-visible:ring-ring/50")
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    focusSpy.mockRestore()
    expect(
      await screen.findByRole("button", { name: i18n.t("history.mockDetail.notFound.action") }),
    ).toHaveAttribute("href", expect.stringContaining("/history?"))
  })
})
