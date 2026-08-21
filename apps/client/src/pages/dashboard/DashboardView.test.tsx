import { fireEvent, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { i18n } from "@/i18n/i18n"
import { dashboardResponseMock } from "@/mocks/data/dashboard"
import type { DashboardResponse } from "@/models/dashboard"
import type { Loadable } from "@/types"

import { renderWithProviders } from "@/test/render"
import { DashboardView } from "./DashboardView"

const emptyMetric = { currentValue: null, previousValue: null } as const

const emptyDashboardResponse = {
  ...structuredClone(dashboardResponseMock),
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
  ...structuredClone(dashboardResponseMock),
  currentRole: {
    id: "role_product_manager_partial",
    title: "Product Manager",
    company: null,
    recruitmentType: "experienced",
    location: null,
    experienceYears: null,
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
  it("renders complete business data and scores on the /100 scale", async () => {
    renderDashboardView({ status: "ready", data: structuredClone(dashboardResponseMock) })

    expect(await screen.findByText(dashboardResponseMock.currentRole!.title)).toBeInTheDocument()
    expect(
      screen.getByText(dashboardResponseMock.recommendation!.recommendation.reason),
    ).toBeInTheDocument()
    expect(screen.getByText("76%")).toBeInTheDocument()
    expect(screen.getAllByText("86/100").length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/\/\s*10(?!0)/)
    expect(screen.getByText(dashboardResponseMock.weaknesses[0].description)).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.weaknesses.description"))).toBeInTheDocument()

    const chart = screen.getByRole("img", { name: "最近 10 次专项练习评分表现" })
    expect(within(chart).getByText("100")).toBeInTheDocument()
    expect(within(chart).queryByText("10")).not.toBeInTheDocument()
    fireEvent.focus(chart)

    expect(await screen.findByText("专项练习 第2次")).toBeInTheDocument()
    expect((await screen.findAllByText("86/100")).length).toBeGreaterThan(1)
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
    const data = structuredClone(dashboardResponseMock)
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
    fireEvent.focus(chart)
    expect(await screen.findByText("专项练习 第1次")).toBeInTheDocument()
  })
})
