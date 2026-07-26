import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { dashboardResponseMock } from "@/mocks/data/dashboard"
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

  it("maps an initial request to the default layout with component skeletons", async () => {
    vi.mocked(getDashboardData).mockReturnValue(new Promise(() => undefined))

    renderDashboardPage()

    expect(await screen.findByText(i18n.t("dashboard.title"))).toBeInTheDocument()
    expect(screen.getByTestId("dashboard-loading-state")).toBeInTheDocument()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(8)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("maps a successful request to the ready default view", async () => {
    vi.mocked(getDashboardData).mockResolvedValue(structuredClone(dashboardResponseMock))

    renderDashboardPage()

    expect(await screen.findByText(dashboardResponseMock.currentRole!.title)).toBeInTheDocument()
    expect(
      screen.getByText(dashboardResponseMock.recommendation!.recommendation.reason),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("dashboard-loading-state")).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("maps a stopped failed request to the error view", async () => {
    vi.mocked(getDashboardData).mockRejectedValue(new Error("dashboard failure"))

    renderDashboardPage()

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("common.pageState.error.title"),
    )
    expect(screen.queryByText(i18n.t("dashboard.title"))).not.toBeInTheDocument()
    expect(screen.queryByText("dashboard failure")).not.toBeInTheDocument()
  })

  it("switches from error to default loading immediately after retry", async () => {
    const user = userEvent.setup()
    const firstRequest = createDeferred<typeof dashboardResponseMock>()
    const secondRequest = createDeferred<typeof dashboardResponseMock>()

    vi.mocked(getDashboardData)
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise)

    renderDashboardPage()

    await act(async () => {
      firstRequest.reject(new Error("first failure"))
    })
    expect(await screen.findByRole("alert")).toBeInTheDocument()

    await user.click(getRetryButton())

    expect(screen.getByText(i18n.t("dashboard.title"))).toBeInTheDocument()
    expect(screen.getByTestId("dashboard-loading-state")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    await act(async () => {
      secondRequest.resolve(structuredClone(dashboardResponseMock))
    })
    expect(await screen.findByText(dashboardResponseMock.currentRole!.title)).toBeInTheDocument()
  })

  it("shows the ready view after a successful retry", async () => {
    const user = userEvent.setup()

    vi.mocked(getDashboardData)
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce(structuredClone(dashboardResponseMock))

    renderDashboardPage()

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    await user.click(getRetryButton())

    expect(await screen.findByText(dashboardResponseMock.currentRole!.title)).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("returns to the error view when a retry fails again", async () => {
    const user = userEvent.setup()

    vi.mocked(getDashboardData)
      .mockRejectedValueOnce(new Error("first failure"))
      .mockRejectedValueOnce(new Error("second failure"))

    renderDashboardPage()

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    await user.click(getRetryButton())

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(getRetryButton()).toBeEnabled()
  })

  it("keeps ready data visible during a background fetch", async () => {
    const firstResponse = structuredClone(dashboardResponseMock)
    const secondRequest = createDeferred<typeof dashboardResponseMock>()
    vi.mocked(getDashboardData)
      .mockResolvedValueOnce(firstResponse)
      .mockReturnValueOnce(secondRequest.promise)
    const renderResult = renderDashboardPage()

    expect(await screen.findByText(firstResponse.currentRole!.title)).toBeInTheDocument()

    await act(async () => {
      void renderResult.queryClient.refetchQueries({ queryKey: ["dashboard"] })
    })
    await waitFor(() => expect(getDashboardData).toHaveBeenCalledTimes(2))

    expect(screen.getByText(firstResponse.currentRole!.title)).toBeInTheDocument()
    expect(screen.queryByTestId("dashboard-loading-state")).not.toBeInTheDocument()

    await act(async () => {
      secondRequest.resolve(structuredClone(dashboardResponseMock))
    })
  })
})
