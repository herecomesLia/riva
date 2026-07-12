import { act, fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import {
  dashboardEmptyResponse,
  dashboardPartialResponse,
  dashboardResponse,
} from "@/mocks/data/dashboard"
import type { DashboardResponse } from "@/models/dashboard"
import { DashboardPage } from "@/pages/dashboard"
import { getDashboardData } from "@/services/dashboard"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/dashboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/dashboard")>()),
  getDashboardData: vi.fn(),
}))

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

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
      mockInterviewScore: { currentValue: 7.4, previousValue: 7.2 },
      practiceTimeMinutes: { currentValue: 32, previousValue: 16 },
      roleFit: { currentValue: 81, previousValue: 75 },
      targetedPracticeScore: { currentValue: 8.6, previousValue: 7.8 },
    },
    performanceTrend: {
      mockInterview: [
        { id: "trend-interview-1", occurredAt: "2026-07-11T13:00:00.000Z", score: 7.4 },
      ],
      targetedPractice: [
        { id: "trend-targeted-1", occurredAt: "2026-07-10T09:00:00.000Z", score: 7.8 },
        { id: "trend-targeted-2", occurredAt: "2026-07-11T09:00:00.000Z", score: 8.6 },
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

function renderDashboardPage() {
  return renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })
}

function getRetryButton() {
  return screen.getByRole("button", { name: i18n.t("common.pageState.error.retry") })
}

describe("DashboardPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getDashboardData).mockReset()
  })

  it("renders complete skeleton sections while pending without successful business values", async () => {
    const dashboardResponse = createDashboardResponse()

    vi.mocked(getDashboardData).mockReturnValue(new Promise(() => undefined))

    renderDashboardPage()

    expect(await screen.findByText(i18n.t("dashboard.title"))).toBeInTheDocument()
    expect(screen.getByTestId("dashboard-loading-top")).toBeInTheDocument()
    expect(screen.getByTestId("dashboard-loading-metrics")).toBeInTheDocument()
    expect(screen.getByTestId("dashboard-loading-bottom")).toBeInTheDocument()
    expect(screen.queryByText(dashboardResponse.currentRole!.title)).not.toBeInTheDocument()
    expect(screen.queryByText(dashboardResponse.recommendation!.title)).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("renders only after the request resolves and uses the returned business values", async () => {
    const dashboardResponse = createDashboardResponse()
    const deferred = createDeferred<DashboardResponse>()

    vi.mocked(getDashboardData).mockReturnValue(deferred.promise)

    renderDashboardPage()

    expect(await screen.findByText(i18n.t("dashboard.title"))).toBeInTheDocument()
    expect(screen.queryByText(dashboardResponse.currentRole!.title)).not.toBeInTheDocument()

    await act(async () => {
      deferred.resolve(dashboardResponse)
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
    expect(screen.queryByTestId("dashboard-loading-state")).not.toBeInTheDocument()

    const chart = screen.getByRole("img", { name: "最近 10 次专项练习评分表现" })
    fireEvent.focus(chart)

    expect(await screen.findByText("专项练习 第2次")).toBeInTheDocument()
  })

  it("updates the rendered role when the service response changes", async () => {
    const dashboardResponse = createDashboardResponse()

    dashboardResponse.currentRole!.title = "替换后的岗位名称 B"
    dashboardResponse.currentRole!.company = "替换后的公司 B"
    vi.mocked(getDashboardData).mockResolvedValue(dashboardResponse)

    renderDashboardPage()

    expect(await screen.findByText("替换后的岗位名称 B")).toBeInTheDocument()
    expect(screen.getByText("替换后的公司 B · 社招")).toBeInTheDocument()
    expect(screen.queryByText("独特岗位名称 A")).not.toBeInTheDocument()
  })

  it("renders safe empty states for the empty scenario response", async () => {
    vi.mocked(getDashboardData).mockResolvedValue(structuredClone(dashboardEmptyResponse))

    renderDashboardPage()

    expect(await screen.findByText("尚未设置目标岗位")).toBeInTheDocument()
    expect(screen.getByText("暂无训练建议")).toBeInTheDocument()
    expect(screen.getAllByText("--")).toHaveLength(4)
    expect(screen.getAllByText("暂无数据")).toHaveLength(4)
    expect(screen.getByText("暂无专项练习记录。")).toBeInTheDocument()
    expect(screen.getByText("暂未发现需要优先补强的薄弱项。")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("renders partial data and local empty states without failing the whole page", async () => {
    vi.mocked(getDashboardData).mockResolvedValue(structuredClone(dashboardPartialResponse))

    renderDashboardPage()

    expect(await screen.findByText(dashboardPartialResponse.currentRole!.title)).toBeInTheDocument()
    expect(screen.getByText("社招")).toBeInTheDocument()
    expect(screen.queryByText("Product Manager ·")).not.toBeInTheDocument()
    expect(screen.getByText("暂无训练建议")).toBeInTheDocument()
    expect(screen.getByText("68%")).toBeInTheDocument()
    expect(screen.getAllByText("--").length).toBeGreaterThan(0)
    expect(screen.getByText(dashboardPartialResponse.weaknesses[0].description)).toBeInTheDocument()

    const chart = screen.getByRole("img", { name: "最近 10 次专项练习评分表现" })
    fireEvent.focus(chart)

    expect(await screen.findByText("专项练习 第1次")).toBeInTheDocument()
  })

  it("renders an error with retry without showing successful business values or raw errors", async () => {
    const dashboardResponse = createDashboardResponse()

    vi.mocked(getDashboardData).mockRejectedValue(new Error("raw dashboard failure"))

    renderDashboardPage()

    const alert = await screen.findByRole("alert")

    expect(alert).toHaveTextContent(i18n.t("common.pageState.error.title"))
    expect(alert).toHaveTextContent(i18n.t("common.pageState.error.description"))
    expect(getRetryButton()).toBeInTheDocument()
    expect(screen.queryByText("raw dashboard failure")).not.toBeInTheDocument()
    expect(screen.queryByText(dashboardResponse.currentRole!.title)).not.toBeInTheDocument()
    expect(screen.queryByText(dashboardResponse.recommendation!.title)).not.toBeInTheDocument()
  })

  it("recovers after retrying a failed first request", async () => {
    const user = userEvent.setup()
    const firstRequest = createDeferred<DashboardResponse>()
    const secondRequest = createDeferred<DashboardResponse>()

    vi.mocked(getDashboardData)
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise)

    renderDashboardPage()

    expect(await screen.findByTestId("dashboard-loading-state")).toBeInTheDocument()

    await act(async () => {
      firstRequest.reject(new Error("first failure"))
    })

    expect(await screen.findByRole("alert")).toBeInTheDocument()

    await user.click(getRetryButton())

    expect(
      screen.getByRole("button", { name: new RegExp(i18n.t("common.pageState.error.retrying")) }),
    ).toBeDisabled()
    await user.click(
      screen.getByRole("button", { name: new RegExp(i18n.t("common.pageState.error.retrying")) }),
    )
    expect(getDashboardData).toHaveBeenCalledTimes(2)

    await act(async () => {
      secondRequest.resolve(dashboardResponse)
    })

    expect(await screen.findByText(dashboardResponse.currentRole!.title)).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByTestId("dashboard-loading-state")).not.toBeInTheDocument()
    expect(getDashboardData).toHaveBeenCalledTimes(2)
  })

  it("keeps the error state available when retry also fails", async () => {
    const user = userEvent.setup()
    const firstRequest = createDeferred<DashboardResponse>()
    const secondRequest = createDeferred<DashboardResponse>()

    vi.mocked(getDashboardData)
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise)

    renderDashboardPage()

    await act(async () => {
      firstRequest.reject(new Error("first failure"))
    })

    expect(await screen.findByRole("alert")).toBeInTheDocument()

    await user.click(getRetryButton())

    await act(async () => {
      secondRequest.reject(new Error("second failure"))
    })

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(getRetryButton()).toBeEnabled()
    expect(screen.queryByText(dashboardResponse.currentRole!.title)).not.toBeInTheDocument()
  })
})
