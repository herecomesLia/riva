import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { AGENT_POLLING_TIMEOUT_MS } from "@/lib/agent-polling"
import { dashboardResponseMock } from "@/mocks/data/dashboard"
import type { TrainingPlanningStatusResponse } from "@/models/training-planning"
import {
  ensureCurrentTrainingPlanning,
  getTrainingPlanningStatus,
  startTrainingPlanning,
} from "@/services/training-planning"
import { getDashboardData } from "@/services/dashboard"
import { renderWithProviders } from "@/test/render"

import { DashboardPage } from "./DashboardPage"

vi.mock("@/services/dashboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/dashboard")>()),
  getDashboardData: vi.fn(),
}))

vi.mock("@/services/training-planning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/training-planning")>()),
  ensureCurrentTrainingPlanning: vi.fn(),
  getTrainingPlanningStatus: vi.fn(),
  startTrainingPlanning: vi.fn(),
}))

const roleId = "11111111-1111-4111-8111-111111111111"
const firstRunId = "22222222-2222-4222-8222-222222222222"
const retriedRunId = "33333333-3333-4333-8333-333333333333"

function dashboardResponse() {
  const response = structuredClone(dashboardResponseMock)
  response.currentRole = {
    ...response.currentRole!,
    id: roleId,
    profileCompleted: true,
    jobDescriptionAdded: true,
  }
  return response
}

function planningResponse(
  status: TrainingPlanningStatusResponse["status"],
  runId = firstRunId,
): TrainingPlanningStatusResponse {
  const terminal = status === "succeeded"
  return {
    runId,
    status,
    targetRoleId: roleId,
    interactionLanguage: "zh-CN",
    attemptCount: status === "queued" ? 0 : 1,
    maxAttempts: 3,
    errorCode: status === "failed" ? "provider_unavailable" : null,
    failureReason: status === "failed" ? "无法生成训练建议。" : null,
    createdAt: "2026-08-18T10:00:00.000Z",
    startedAt: status === "queued" ? null : "2026-08-18T10:00:00.000Z",
    finishedAt: terminal || status === "failed" ? "2026-08-18T10:00:01.000Z" : null,
    plan: terminal
      ? {
          action: "targetedPractice",
          reason: "根据当前岗位补强项目结果表达。",
          focusAreas: ["项目结果"],
          questionType: "projectDeepDive",
          difficulty: "basic",
          prioritizeWeaknesses: false,
        }
      : null,
  }
}

describe("Dashboard Planner integration", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getDashboardData).mockReset()
    vi.mocked(ensureCurrentTrainingPlanning).mockReset()
    vi.mocked(getTrainingPlanningStatus).mockReset()
    vi.mocked(startTrainingPlanning).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("ensures once and displays a succeeded targeted plan", async () => {
    const response = planningResponse("succeeded")
    vi.mocked(getDashboardData).mockResolvedValue(dashboardResponse())
    vi.mocked(ensureCurrentTrainingPlanning).mockResolvedValue(response)
    vi.mocked(getTrainingPlanningStatus).mockResolvedValue(response)

    const view = renderWithProviders(<DashboardPage />, {
      router: { initialEntries: ["/dashboard"] },
    })

    await waitFor(() => expect(ensureCurrentTrainingPlanning).toHaveBeenCalledOnce())
    expect(await screen.findByText(response.plan!.reason)).toBeInTheDocument()
    expect(ensureCurrentTrainingPlanning).toHaveBeenCalledWith({ targetRoleId: roleId })
    expect(ensureCurrentTrainingPlanning).toHaveBeenCalledOnce()

    view.rerender(<DashboardPage />)
    await waitFor(() => expect(ensureCurrentTrainingPlanning).toHaveBeenCalledOnce())
  })

  it("keeps the card in loading state while the current plan is queued", async () => {
    const response = planningResponse("queued")
    vi.mocked(getDashboardData).mockResolvedValue(dashboardResponse())
    vi.mocked(ensureCurrentTrainingPlanning).mockResolvedValue(response)
    vi.mocked(getTrainingPlanningStatus).mockResolvedValue(response)

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })

    expect(
      await screen.findByText(i18n.t("dashboard.recommendation.generating.description")),
    ).toBeInTheDocument()
    await waitFor(() => expect(getTrainingPlanningStatus).toHaveBeenCalledWith(firstRunId))
  })

  it("stops a queued plan poll and rechecks without creating another plan", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const queued = planningResponse("queued")
    vi.mocked(getDashboardData).mockResolvedValue(dashboardResponse())
    vi.mocked(ensureCurrentTrainingPlanning).mockResolvedValue(queued)
    vi.mocked(getTrainingPlanningStatus).mockResolvedValue(queued)

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })
    await waitFor(() => expect(getTrainingPlanningStatus).toHaveBeenCalled())
    await act(async () => vi.advanceTimersByTimeAsync(AGENT_POLLING_TIMEOUT_MS))

    expect(screen.getByText(i18n.t("common.agentPolling.timeoutTitle"))).toBeVisible()
    const callsAtTimeout = vi.mocked(getTrainingPlanningStatus).mock.calls.length
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(getTrainingPlanningStatus).toHaveBeenCalledTimes(callsAtTimeout)
    expect(ensureCurrentTrainingPlanning).toHaveBeenCalledOnce()
    expect(startTrainingPlanning).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: i18n.t("common.agentPolling.recheck") }))
    await waitFor(() => expect(getTrainingPlanningStatus).toHaveBeenCalledTimes(callsAtTimeout + 1))
    expect(ensureCurrentTrainingPlanning).toHaveBeenCalledOnce()
    expect(startTrainingPlanning).not.toHaveBeenCalled()
  })

  it("retries a failed plan with a new request id", async () => {
    const user = userEvent.setup()
    const failed = planningResponse("failed")
    const retried = planningResponse("succeeded", retriedRunId)
    vi.mocked(getDashboardData).mockResolvedValue(dashboardResponse())
    vi.mocked(ensureCurrentTrainingPlanning).mockResolvedValue(failed)
    vi.mocked(getTrainingPlanningStatus).mockResolvedValueOnce(failed).mockResolvedValue(retried)
    vi.mocked(startTrainingPlanning).mockResolvedValue(retried)

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })
    await waitFor(() => expect(ensureCurrentTrainingPlanning).toHaveBeenCalledOnce())
    await waitFor(() => expect(getTrainingPlanningStatus).toHaveBeenCalledWith(firstRunId))

    const retry = await screen.findByRole("button", {
      name: i18n.t("dashboard.recommendation.failed.retry"),
    })
    await user.click(retry)

    await waitFor(() => expect(startTrainingPlanning).toHaveBeenCalledOnce())
    expect(vi.mocked(startTrainingPlanning).mock.calls[0]?.[0]).toEqual({
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      targetRoleId: roleId,
    })
    expect(await screen.findByText(retried.plan!.reason)).toBeInTheDocument()
  })

  it("does not request Planner when there is no current role", async () => {
    vi.mocked(getDashboardData).mockResolvedValue({
      ...dashboardResponse(),
      currentRole: null,
    })

    renderWithProviders(<DashboardPage />, { router: { initialEntries: ["/dashboard"] } })

    expect(
      await screen.findByText(i18n.t("dashboard.recommendation.empty.title")),
    ).toBeInTheDocument()
    expect(ensureCurrentTrainingPlanning).not.toHaveBeenCalled()
  })
})
