import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  dashboardEmptyResponse,
  dashboardPartialResponse,
  dashboardResponse,
} from "@/mocks/data/dashboard"
import { i18n } from "@/i18n/i18n"
import type { DashboardResponse } from "@/models/dashboard"
import type { Loadable } from "@/types"

import { DashboardView } from "./DashboardView"
import { renderWithProviders } from "@/test/render"

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
    expect(screen.getByTestId("dashboard-loading-top")).toBeInTheDocument()
    expect(screen.getByTestId("dashboard-loading-metrics")).toBeInTheDocument()
    expect(screen.getByTestId("dashboard-loading-bottom")).toBeInTheDocument()
    expect(screen.getAllByText("测试用户")).toHaveLength(1)
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(18)
  })

  it("renders complete business data in the ready layout", async () => {
    renderDashboardView({ status: "ready", data: structuredClone(dashboardResponse) })

    expect(await screen.findByText(dashboardResponse.currentRole!.title)).toBeInTheDocument()
    expect(screen.getByText(dashboardResponse.recommendation!.title)).toBeInTheDocument()
    expect(screen.getByText("76%")).toBeInTheDocument()
    expect(screen.getByText(dashboardResponse.weaknesses[0].description)).toBeInTheDocument()

    const chart = screen.getByRole("img", { name: "最近 10 次专项练习评分表现" })
    fireEvent.focus(chart)

    expect(await screen.findByText("专项练习 第10次")).toBeInTheDocument()
  })

  it("renders local empty states for null, empty arrays, and empty metrics", async () => {
    renderDashboardView({ status: "ready", data: structuredClone(dashboardEmptyResponse) })

    expect(await screen.findByText("尚未设置目标岗位")).toBeInTheDocument()
    expect(screen.getByText("暂无训练建议")).toBeInTheDocument()
    expect(screen.getAllByText("--")).toHaveLength(4)
    expect(screen.getAllByText("暂无数据")).toHaveLength(4)
    expect(screen.getByText("暂无专项练习记录。")).toBeInTheDocument()
    expect(screen.getByText("暂未发现需要优先补强的薄弱项。")).toBeInTheDocument()
  })

  it("renders an unchanged metric comparison", async () => {
    const data = structuredClone(dashboardResponse)
    data.metrics.roleFit = { currentValue: 76, previousValue: 76 }

    renderDashboardView({ status: "ready", data })

    expect(await screen.findByText("0%")).toBeInTheDocument()
  })

  it("renders partial data without failing unrelated cards", async () => {
    renderDashboardView({ status: "ready", data: structuredClone(dashboardPartialResponse) })

    expect(await screen.findByText(dashboardPartialResponse.currentRole!.title)).toBeInTheDocument()
    expect(screen.getByText("暂无训练建议")).toBeInTheDocument()
    expect(screen.getByText("68%")).toBeInTheDocument()
    expect(screen.getByText(dashboardPartialResponse.weaknesses[0].description)).toBeInTheDocument()

    const chart = screen.getByRole("img", { name: "最近 10 次专项练习评分表现" })
    fireEvent.focus(chart)
    expect(await screen.findByText("专项练习 第1次")).toBeInTheDocument()
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
