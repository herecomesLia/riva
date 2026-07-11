import { screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { DashboardPage } from "@/pages/dashboard"
import type { DashboardData } from "@/services/dashboard"
import { getDashboardData } from "@/services/dashboard"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/dashboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/dashboard")>()),
  getDashboardData: vi.fn(),
}))

const dashboardData: DashboardData = {
  metrics: [
    {
      comparisonKey: "dashboard.metrics.roleFit.comparison",
      currentValue: 76,
      icon: "roleFit",
      previousValue: 65.8,
      titleKey: "dashboard.metrics.roleFit.title",
      valueKey: "dashboard.metrics.values.percentage",
      valueFormat: "percentage",
    },
  ],
  performanceTrend: {
    targetedPractice: [{ date: "2026-07-11", score: 8.1 }],
    mockInterview: [{ date: "2026-07-11", score: 7.4 }],
  },
  weaknesses: [],
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
  })

  it("renders dashboard content after data loads successfully", async () => {
    vi.mocked(getDashboardData).mockResolvedValue(dashboardData)

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })

    await waitFor(() => {
      expect(screen.getByText(i18n.t("dashboard.metrics.roleFit.title"))).toBeInTheDocument()
    })
    expect(screen.queryByText(i18n.t("common.pageState.error.title"))).not.toBeInTheDocument()
  })
})
