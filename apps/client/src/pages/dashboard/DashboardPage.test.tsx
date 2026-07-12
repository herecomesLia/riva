import { screen, waitFor } from "@testing-library/react"
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

const dashboardData: DashboardResponse = {
  currentRole: {
    id: "role-1",
    title: "前端工程师",
    company: "字节跳动",
    recruitmentType: "experienced",
    location: "上海",
    experienceYears: {
      min: 3,
      max: 5,
    },
    profileCompleted: true,
    jobDescriptionAdded: false,
  },
  recommendation: {
    id: "recommendation-1",
    title: "重练：项目难点与解决方案",
    description: "最近回答已经说清背景，但解决过程的取舍和成果量化仍可更具体。",
    questionType: "projectExperience",
    estimatedMinutes: 8,
  },
  metrics: {
    roleFit: { currentValue: 76, previousValue: 65.8 },
    practiceTimeMinutes: { currentValue: 45, previousValue: 49 },
    targetedPracticeScore: { currentValue: 8.1, previousValue: 7.5 },
    mockInterviewScore: { currentValue: 7.4, previousValue: 7.2 },
  },
  performanceTrend: {
    targetedPractice: [
      { id: "targeted-practice-1", occurredAt: "2026-07-11T09:00:00.000Z", score: 8.1 },
    ],
    mockInterview: [{ id: "mock-interview-1", occurredAt: "2026-07-11T13:00:00.000Z", score: 7.4 }],
  },
  weaknesses: [
    {
      id: "weakness-1",
      category: "projectExpression",
      description: "回答结构与关键取舍可以更清晰。",
      recommendedPracticeCount: 2,
    },
  ],
}

describe("DashboardPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getDashboardData).mockReset()
  })

  it("renders loading UI while dashboard data is pending", async () => {
    vi.mocked(getDashboardData).mockImplementation(() => new Promise(() => {}))

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })

    expect(await screen.findByText(i18n.t("dashboard.title"))).toBeInTheDocument()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("renders error UI when dashboard data fails", async () => {
    vi.mocked(getDashboardData).mockRejectedValue(new Error("Failed to load dashboard"))

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })

    expect(await screen.findByText(i18n.t("common.pageState.error.title"))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("dashboard.metrics.roleFit.title"))).not.toBeInTheDocument()
    expect(screen.queryByText(dashboardData.currentRole!.title)).not.toBeInTheDocument()
  })

  it("renders dashboard content after data loads successfully", async () => {
    vi.mocked(getDashboardData).mockResolvedValue(dashboardData)

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })

    await waitFor(() => {
      expect(screen.getByText(i18n.t("dashboard.metrics.roleFit.title"))).toBeInTheDocument()
    })
    expect(screen.getByText(dashboardData.currentRole!.title)).toBeInTheDocument()
    expect(screen.getByText(dashboardData.recommendation!.title)).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("dashboard.recommendation.questionTypes.projectExperience")),
    ).toBeInTheDocument()
    expect(screen.getByText(dashboardData.weaknesses[0].description)).toBeInTheDocument()
    expect(
      screen.getByLabelText(
        i18n.t("dashboard.performanceTrend.chartLabel", {
          type: i18n.t("dashboard.performanceTrend.types.targetedPractice"),
        }),
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("common.pageState.error.title"))).not.toBeInTheDocument()
  })

  it("renders safe empty states for missing dashboard data", async () => {
    const emptyDashboardData = structuredClone(dashboardData)

    emptyDashboardData.currentRole = null
    emptyDashboardData.recommendation = null
    emptyDashboardData.metrics.roleFit = { currentValue: null, previousValue: null }
    emptyDashboardData.metrics.practiceTimeMinutes = { currentValue: 45, previousValue: 0 }
    emptyDashboardData.performanceTrend.targetedPractice = []
    emptyDashboardData.performanceTrend.mockInterview = []
    emptyDashboardData.weaknesses = []
    vi.mocked(getDashboardData).mockResolvedValue(emptyDashboardData)

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })

    expect(await screen.findByText(i18n.t("dashboard.currentRole.empty.title"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.recommendation.empty.title"))).toBeInTheDocument()
    expect(screen.getByText("--")).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.metrics.noData"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.metrics.noComparison"))).toBeInTheDocument()
    expect(
      screen.getByText(
        i18n.t("dashboard.performanceTrend.empty", {
          type: i18n.t("dashboard.performanceTrend.types.targetedPractice"),
        }),
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByLabelText(
        i18n.t("dashboard.performanceTrend.chartLabel", {
          type: i18n.t("dashboard.performanceTrend.types.targetedPractice"),
        }),
      ),
    ).not.toBeInTheDocument()
    expect(screen.getByText(i18n.t("dashboard.weaknesses.empty"))).toBeInTheDocument()
  })
})
