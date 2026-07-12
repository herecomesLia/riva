import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import type { DashboardResponse } from "@/models/dashboard"
import { DashboardPage } from "@/pages/dashboard"
import { getDashboardData } from "@/services/dashboard"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/dashboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/dashboard")>()),
  getDashboardData: vi.fn(),
}))

function createDashboardResponse(): DashboardResponse {
  return {
    currentRole: {
      id: "role-unique-a",
      title: "独特岗位名称 A",
      company: "唯一公司 A",
      recruitmentType: "experienced",
      location: "测试城市 A",
      experienceYears: { min: 3, max: 5 },
      profileCompleted: true,
      jobDescriptionAdded: false,
    },
    recommendation: {
      id: "recommendation-unique-a",
      title: "独特推荐标题 A",
      description: "独特推荐描述 A",
      questionType: "projectExperience",
      estimatedMinutes: 8,
    },
    metrics: {
      roleFit: { currentValue: 81, previousValue: 75 },
      practiceTimeMinutes: { currentValue: 32, previousValue: 16 },
      targetedPracticeScore: { currentValue: 8.6, previousValue: 7.8 },
      mockInterviewScore: { currentValue: 7.4, previousValue: 7.2 },
    },
    performanceTrend: {
      targetedPractice: [
        { id: "trend-targeted-1", occurredAt: "2026-07-10T09:00:00.000Z", score: 7.8 },
        { id: "trend-targeted-2", occurredAt: "2026-07-11T09:00:00.000Z", score: 8.6 },
      ],
      mockInterview: [
        { id: "trend-interview-1", occurredAt: "2026-07-11T13:00:00.000Z", score: 7.4 },
      ],
    },
    weaknesses: [
      {
        id: "weakness-unique-a",
        category: "projectExpression",
        description: "独特薄弱项描述 A",
        recommendedPracticeCount: 3,
      },
    ],
  }
}

describe("DashboardPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getDashboardData).mockReset()
  })

  it("renders only after the request resolves and uses the returned business values", async () => {
    const dashboardResponse = createDashboardResponse()
    let resolveDashboardData!: (value: DashboardResponse) => void

    vi.mocked(getDashboardData).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDashboardData = resolve
        }),
    )

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })

    expect(await screen.findByText(i18n.t("dashboard.title"))).toBeInTheDocument()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(screen.queryByText(dashboardResponse.currentRole!.title)).not.toBeInTheDocument()
    expect(screen.queryByText(dashboardResponse.currentRole!.company!)).not.toBeInTheDocument()
    expect(screen.queryByText(dashboardResponse.recommendation!.title)).not.toBeInTheDocument()

    await act(async () => {
      resolveDashboardData(dashboardResponse)
    })

    expect(await screen.findByText(dashboardResponse.currentRole!.title)).toBeInTheDocument()
    expect(screen.getByText("唯一公司 A · 社招")).toBeInTheDocument()
    expect(screen.getByText("测试城市 A · 3–5 年经验")).toBeInTheDocument()
    expect(screen.getByText(dashboardResponse.recommendation!.title)).toBeInTheDocument()
    expect(screen.getByText(dashboardResponse.recommendation!.description)).toBeInTheDocument()
    expect(screen.getByText("项目经历题")).toBeInTheDocument()
    expect(screen.getByText("预计 8 分钟")).toBeInTheDocument()
    expect(screen.getByText("81%")).toBeInTheDocument()
    expect(screen.getByText("32")).toBeInTheDocument()
    expect(screen.getByText("分钟")).toBeInTheDocument()
    expect(screen.getAllByText("8.6 / 10").length).toBeGreaterThan(0)
    expect(screen.getByText("较上次岗位分析 75%")).toBeInTheDocument()
    expect(screen.getByText("较昨日 16 分钟")).toBeInTheDocument()
    expect(screen.getByText(dashboardResponse.weaknesses[0].description)).toBeInTheDocument()
    expect(screen.getByText("建议练习 3 题")).toBeInTheDocument()

    const chart = screen.getByRole("img", { name: "最近 10 次专项练习评分表现" })
    fireEvent.focus(chart)

    expect(await screen.findByText("专项练习 第2次")).toBeInTheDocument()
  })

  it("updates the rendered role when the service response changes", async () => {
    const dashboardResponse = createDashboardResponse()

    dashboardResponse.currentRole!.title = "替换后的岗位名称 B"
    dashboardResponse.currentRole!.company = "替换后的公司 B"
    vi.mocked(getDashboardData).mockResolvedValue(dashboardResponse)

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })

    expect(await screen.findByText("替换后的岗位名称 B")).toBeInTheDocument()
    expect(screen.getByText("替换后的公司 B · 社招")).toBeInTheDocument()
    expect(screen.queryByText("独特岗位名称 A")).not.toBeInTheDocument()
  })

  it("renders safe empty states for null and empty response data", async () => {
    const dashboardResponse = createDashboardResponse()

    dashboardResponse.currentRole = null
    dashboardResponse.recommendation = null
    dashboardResponse.metrics.roleFit = { currentValue: null, previousValue: null }
    dashboardResponse.performanceTrend.targetedPractice = []
    dashboardResponse.performanceTrend.mockInterview = []
    dashboardResponse.weaknesses = []
    vi.mocked(getDashboardData).mockResolvedValue(dashboardResponse)

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })

    expect(await screen.findByText("尚未设置目标岗位")).toBeInTheDocument()
    expect(screen.getByText("暂无训练建议")).toBeInTheDocument()
    expect(screen.getByText("--")).toBeInTheDocument()
    expect(screen.getByText("暂无数据")).toBeInTheDocument()
    expect(screen.getByText("暂无专项练习记录。")).toBeInTheDocument()
    expect(screen.getByText("暂未发现需要优先补强的薄弱项。")).toBeInTheDocument()
  })

  it("renders a single performance record without breaking the chart", async () => {
    const dashboardResponse = createDashboardResponse()

    dashboardResponse.metrics.targetedPracticeScore = { currentValue: 9.1, previousValue: 8.6 }
    dashboardResponse.performanceTrend.targetedPractice = [
      { id: "trend-targeted-single", occurredAt: "2026-07-12T09:00:00.000Z", score: 9.1 },
    ]
    vi.mocked(getDashboardData).mockResolvedValue(dashboardResponse)

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })

    const chart = await screen.findByRole("img", { name: "最近 10 次专项练习评分表现" })
    fireEvent.focus(chart)

    expect(await screen.findByText("专项练习 第1次")).toBeInTheDocument()
    expect(screen.getAllByText("9.1 / 10").length).toBeGreaterThan(0)
  })

  it("renders an error without showing successful business values", async () => {
    const dashboardResponse = createDashboardResponse()

    vi.mocked(getDashboardData).mockRejectedValue(new Error("Failed to load dashboard"))

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })

    await waitFor(() => {
      expect(screen.getByText(i18n.t("common.pageState.error.title"))).toBeInTheDocument()
    })
    expect(screen.queryByText(dashboardResponse.currentRole!.title)).not.toBeInTheDocument()
    expect(screen.queryByText(dashboardResponse.currentRole!.company!)).not.toBeInTheDocument()
    expect(screen.queryByText(dashboardResponse.recommendation!.title)).not.toBeInTheDocument()
    expect(screen.queryByText(dashboardResponse.weaknesses[0].description)).not.toBeInTheDocument()
  })
})
