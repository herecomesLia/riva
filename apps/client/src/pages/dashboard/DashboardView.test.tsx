import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { dashboardStoryFixture } from "./stories/dashboard-story-fixtures"
import type { DashboardResponse } from "@/models/dashboard"
import type { Loadable } from "@/types"

import { renderWithProviders } from "@/test/render"
import { DashboardView } from "./DashboardView"

const emptyMetric = { currentValue: null, previousValue: null } as const

const emptyDashboardResponse = {
  ...structuredClone(dashboardStoryFixture),
  currentRole: null,
  recommendation: null,
  metrics: {
    mockInterviewScore: emptyMetric,
    practiceTimeMinutes: emptyMetric,
    roleFit: emptyMetric,
    targetedPracticeScore: emptyMetric,
  },
  performanceTrend: {
    mockInterview: [],
    targetedPractice: [],
  },
  weaknesses: [],
} satisfies DashboardResponse

const partialDashboardResponse = {
  ...structuredClone(dashboardStoryFixture),
  currentRole: {
    id: "role_product_manager_partial",
    title: "Product Manager",
    company: null,
    recruitmentType: "experienced",
    location: null,
    profileCompleted: false,
    jobDescriptionAdded: true,
  },
  recommendation: null,
  metrics: {
    mockInterviewScore: emptyMetric,
    practiceTimeMinutes: { currentValue: 18, previousValue: null },
    roleFit: { currentValue: 68, previousValue: null },
    targetedPracticeScore: emptyMetric,
  },
  performanceTrend: {
    mockInterview: [],
    targetedPractice: [
      { id: "partial-targeted-practice-001", occurredAt: "2026-07-09T10:00:00.000Z", score: 71 },
    ],
  },
  weaknesses: [
    {
      id: "partial-weakness-project-expression",
      category: "projectExpression",
      description: "Clarify the problem, action, and outcome in a tighter story.",
      recommendedPracticeCount: 1,
    },
  ],
} satisfies DashboardResponse

function renderDashboardView(content: Loadable<DashboardResponse>) {
  return renderWithProviders(
    <DashboardView content={content} displayName="测试用户" variant="default" />,
    { router: { initialEntries: ["/dashboard"] } },
  )
}

describe("DashboardView", () => {
  it("renders the header, complete grid, and each component skeleton while loading", async () => {
    renderDashboardView({ status: "loading" })

    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.currentRole.eyebrow"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.recommendation.eyebrow"))).toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: i18n.t("dashboard.metrics.eyebrow") }),
    ).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.metrics.roleFit.title"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.metrics.practiceTime.title"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.metrics.targetedPractice.title"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.metrics.mockInterview.title"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.performanceTrend.title"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.weaknesses.eyebrow"))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("dashboard.weaknesses.description"))).not.toBeInTheDocument()
    expect(screen.getAllByText("测试用户")).toHaveLength(1)
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(18)
  })

  it("renders complete business data in the ready layout", async () => {
    renderDashboardView({ status: "ready", data: structuredClone(dashboardStoryFixture) })

    expect(await screen.findByText(dashboardStoryFixture.currentRole!.title)).toBeInTheDocument()
    expect(
      screen.getByText(dashboardStoryFixture.recommendation!.recommendation.reason),
    ).toBeInTheDocument()
    expect(screen.getByText("76%")).toBeInTheDocument()
    expect(screen.getAllByText("8.6 / 10").length).toBeGreaterThan(0)
    expect(screen.getByText(dashboardStoryFixture.weaknesses[0].description)).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.weaknesses.description"))).toBeInTheDocument()
    const recommendationLink = screen.getByRole("link", {
      name: i18n.t("history.detail.recommendationActions.mockInterview"),
    })
    expect(recommendationLink).toHaveAttribute("href", expect.stringContaining("/interview?"))
    expect(recommendationLink.getAttribute("href")).toContain(
      `targetRoleId=${dashboardStoryFixture.recommendation!.targetRoleId}`,
    )
    const historyLink = screen.getByRole("link", { name: i18n.t("dashboard.actions.viewHistory") })
    expect(historyLink).toHaveClass("border-border")
    expect(historyLink).not.toHaveClass("border-transparent")

    const chart = screen.getByRole("img", { name: "最近 10 次专项练习评分表现" })
    fireEvent.focus(chart)

    expect(await screen.findByText("专项练习 第2次")).toBeInTheDocument()
  })

  it("renders local empty states for null, empty arrays, and empty metrics", async () => {
    renderDashboardView({ status: "ready", data: structuredClone(emptyDashboardResponse) })

    expect(await screen.findByText("尚未设置目标岗位")).toBeInTheDocument()
    expect(screen.getByText("暂无训练建议")).toBeInTheDocument()
    expect(screen.getAllByText("--")).toHaveLength(4)
    expect(screen.getAllByText("暂无数据")).toHaveLength(4)
    expect(screen.getByText("暂无专项练习记录。")).toBeInTheDocument()
    expect(screen.getByText("暂未发现需要优先补强的薄弱项。")).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.weaknesses.description"))).toBeInTheDocument()
  })

  it("renders an unchanged metric comparison", async () => {
    const data = structuredClone(dashboardStoryFixture)
    data.metrics.roleFit = { currentValue: 76, previousValue: 76 }

    renderDashboardView({ status: "ready", data })

    expect(await screen.findByText("0%")).toBeInTheDocument()
  })

  it("renders partial data without failing unrelated cards", async () => {
    renderDashboardView({ status: "ready", data: structuredClone(partialDashboardResponse) })

    expect(await screen.findByText(partialDashboardResponse.currentRole!.title)).toBeInTheDocument()
    expect(screen.getByText("暂无训练建议")).toBeInTheDocument()
    expect(screen.getByText("68%")).toBeInTheDocument()
    expect(screen.getByText(partialDashboardResponse.weaknesses[0].description)).toBeInTheDocument()

    const chart = screen.getByRole("img", { name: "最近 10 次专项练习评分表现" })
    expect(chart.querySelector("circle")).toHaveAttribute("r", "4")
    fireEvent.focus(chart)
    expect(await screen.findByText("专项练习 第1次")).toBeInTheDocument()
    fireEvent.blur(chart)
    expect(chart.querySelector("circle")).toHaveAttribute("r", "4")
  })

  it("renders only the page-level error and calls retry", async () => {
    const onRetry = vi.fn()

    renderWithProviders(<DashboardView onRetry={onRetry} variant="error" />, {
      router: { initialEntries: ["/dashboard"] },
    })

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    const retryButton = screen.getByRole("button", {
      name: i18n.t("common.pageState.error.retry"),
    })
    expect(retryButton).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "工作台" })).not.toBeInTheDocument()
    expect(document.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument()

    retryButton.click()
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
