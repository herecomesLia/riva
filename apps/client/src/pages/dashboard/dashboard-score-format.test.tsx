import { fireEvent, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { i18n } from "@/i18n/i18n"
import type { DashboardResponse } from "@/models/dashboard"
import { HistoryOverview } from "@/pages/history/components/HistoryOverview"
import { historyOverviewStoryFixture } from "@/pages/history/stories/history-story-fixtures"
import { renderWithProviders } from "@/test/render"

import { DashboardMetrics } from "./components/DashboardMetrics"
import { PerformanceTrendCard } from "./components/PerformanceTrendCard"

const metricWithoutComparison = { currentValue: 80, previousValue: null }

const scoreMetrics: DashboardResponse["metrics"] = {
  mockInterviewScore: metricWithoutComparison,
  practiceTimeMinutes: { currentValue: 30, previousValue: null },
  roleFit: { currentValue: 75, previousValue: null },
  targetedPracticeScore: metricWithoutComparison,
}

const scoreTrend: DashboardResponse["performanceTrend"] = {
  mockInterview: [],
  targetedPractice: [
    {
      id: "targeted-practice-score-80",
      occurredAt: "2026-08-20T10:00:00.000Z",
      score: 80,
    },
  ],
}

function renderScoreSections(
  metrics: DashboardResponse["metrics"],
  performanceTrend: DashboardResponse["performanceTrend"],
) {
  return renderWithProviders(
    <>
      <DashboardMetrics state={{ status: "ready", data: metrics }} />
      <PerformanceTrendCard state={{ status: "ready", data: performanceTrend }} />
    </>,
    { router: false },
  )
}

describe("dashboard score format", () => {
  it("shows training scores on a /100 scale across metrics and trends", async () => {
    renderScoreSections(scoreMetrics, scoreTrend)

    expect(screen.getAllByText("80/100").length).toBeGreaterThanOrEqual(4)
    expect(document.body.textContent).not.toMatch(/\/\s*10(?!0)/)

    const chart = screen.getByRole("img", {
      name: i18n.t("dashboard.performanceTrend.chartLabel", {
        type: i18n.t("dashboard.performanceTrend.types.targetedPractice"),
      }),
    })
    expect(within(chart).getByText("100")).toBeInTheDocument()
    expect(within(chart).queryByText("10")).not.toBeInTheDocument()

    fireEvent.focus(chart)
    expect((await screen.findAllByText("80/100")).length).toBeGreaterThanOrEqual(5)
  })

  it("keeps score cards and trends in their normal empty states", () => {
    const emptyMetric = { currentValue: null, previousValue: null }

    renderScoreSections(
      {
        mockInterviewScore: emptyMetric,
        practiceTimeMinutes: emptyMetric,
        roleFit: emptyMetric,
        targetedPracticeScore: emptyMetric,
      },
      { mockInterview: [], targetedPractice: [] },
    )

    expect(screen.getAllByText("--")).toHaveLength(4)
    expect(screen.getAllByText(i18n.t("dashboard.metrics.noData"))).toHaveLength(4)
    expect(
      screen.getByText(
        i18n.t("dashboard.performanceTrend.empty", {
          type: i18n.t("dashboard.performanceTrend.types.targetedPractice"),
        }),
      ),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\/\s*10(?!0)/)
  })

  it("keeps the training history summary on the same /100 scale", () => {
    renderWithProviders(
      <HistoryOverview
        state={{
          status: "ready",
          data: { ...historyOverviewStoryFixture, averageScore: 80 },
        }}
      />,
      { router: false },
    )

    expect(screen.getByText("80/100")).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\/\s*10(?!0)/)
  })
})
