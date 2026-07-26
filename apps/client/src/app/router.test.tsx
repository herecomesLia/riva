import { QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppRouter } from "@/app/router"
import { TooltipProvider } from "@/components/ui/tooltip"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { userMock } from "@/mocks/data/auth"
import { useAuthStore } from "@/stores/auth"
import { createTestQueryClient } from "@/test/query-client"
import { resetStores } from "@/test/stores"

vi.mock("@/services/training-records", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/training-records")>()
  const { TrainingRecordNotFoundError } = await import("@/models/training-records")
  const { historyOverviewStoryFixture, historyRecordsStoryFixture } =
    await import("@/pages/history/stories/history-story-fixtures")
  const { completeMockInterviewHistoryStoryFixture } =
    await import("@/pages/history/stories/mock-interview-history-story-fixtures")
  const { completedTargetedPracticeHistoryStoryFixture } =
    await import("@/pages/history/stories/targeted-practice-history-story-fixtures")

  return {
    ...original,
    getTrainingRecordsOverview: vi.fn(async () => structuredClone(historyOverviewStoryFixture)),
    listTrainingRecords: vi.fn(async (input) => {
      const response = structuredClone(historyRecordsStoryFixture)
      response.pagination.page = input.page
      return response
    }),
    getTargetedPracticeRecord: vi.fn(async (recordId) => {
      if (recordId === completedTargetedPracticeHistoryStoryFixture.id) {
        return structuredClone(completedTargetedPracticeHistoryStoryFixture)
      }
      throw new TrainingRecordNotFoundError("targetedPractice", recordId)
    }),
    getMockInterviewRecord: vi.fn(async (recordId) => {
      if (recordId === completeMockInterviewHistoryStoryFixture.id) {
        return structuredClone(completeMockInterviewHistoryStoryFixture)
      }
      throw new TrainingRecordNotFoundError("mockInterview", recordId)
    }),
  }
})

function renderRouterAt(path: string) {
  window.history.pushState(null, "", path)

  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={createTestQueryClient()}>
        <TooltipProvider>
          <AppRouter />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  )
}

describe("app router auth redirects", () => {
  beforeEach(async () => {
    resetStores()
    await i18n.changeLanguage(defaultLanguage)
  })

  it("redirects the root route to login when signed out", async () => {
    renderRouterAt("/")

    await waitFor(() => {
      expect(window.location.pathname).toBe("/login")
    })
  })

  it("redirects app routes to login when signed out", async () => {
    renderRouterAt("/dashboard")

    await waitFor(() => {
      expect(window.location.pathname).toBe("/login")
    })
  })

  it("redirects login to dashboard when signed in", async () => {
    useAuthStore.getState().setCurrentUser(userMock)

    renderRouterAt("/login")

    await waitFor(() => {
      expect(window.location.pathname).toBe("/dashboard")
    })
  })

  it("renders the authenticated interview session route", async () => {
    useAuthStore.getState().setCurrentUser(userMock)

    renderRouterAt("/interview/session/mock-session")

    expect(
      await screen.findByRole("heading", {
        name: i18n.t("interview.session.title"),
        level: 1,
      }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/interview/session/mock-session")
    expect(screen.getByRole("link", { name: i18n.t("appShell.nav.interview") })).toHaveAttribute(
      "data-active",
    )
  })

  it("renders the authenticated interview review route", async () => {
    useAuthStore.getState().setCurrentUser(userMock)

    renderRouterAt("/interview/review/mock-session")

    expect(
      await screen.findByRole("heading", {
        name: i18n.t("interview.review.title"),
        level: 1,
      }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/interview/review/mock-session")
    expect(screen.getByRole("link", { name: i18n.t("appShell.nav.interview") })).toHaveAttribute(
      "data-active",
    )
  })

  it("renders the authenticated targeted-practice history detail route", async () => {
    useAuthStore.getState().setCurrentUser(userMock)

    renderRouterAt("/history/practice/targeted-practice-record-001")

    expect(
      await screen.findByRole("heading", {
        name: i18n.t("history.detail.title"),
        level: 1,
      }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/history/practice/targeted-practice-record-001")
    expect(screen.getByRole("link", { name: i18n.t("appShell.nav.history") })).toHaveAttribute(
      "data-active",
    )
  })

  it("renders the authenticated mock-interview history detail route", async () => {
    useAuthStore.getState().setCurrentUser(userMock)

    renderRouterAt("/history/interview/mock-interview-record-001")

    expect(
      await screen.findByRole("heading", {
        name: i18n.t("history.mockDetail.title"),
        level: 1,
      }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/history/interview/mock-interview-record-001")
    expect(screen.getByRole("link", { name: i18n.t("appShell.nav.history") })).toHaveAttribute(
      "data-active",
    )
  })

  it("preserves list filters and pagination across detail navigation and return", async () => {
    const user = userEvent.setup()
    useAuthStore.getState().setCurrentUser(userMock)
    const historySearch = "?kind=all&targetRoleId=all&timeRange=all&page=2"

    renderRouterAt(`/history${historySearch}`)

    const [detailLink] = await screen.findAllByRole(
      "button",
      {
        name: /查看.*详情/,
      },
      { timeout: 3_000 },
    )
    await user.click(detailLink)
    expect(window.location.search).toBe(historySearch)

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("history.detail.back"),
      }),
    )
    await waitFor(() => expect(window.location.pathname).toBe("/history"))
    expect(window.location.search).toBe(historySearch)
    expect(
      await screen.findByText(i18n.t("history.pagination.page", { page: 2, total: 2 })),
    ).toBeInTheDocument()
  })

  it("handles an unknown record ID opened directly and returns to the requested list state", async () => {
    const user = userEvent.setup()
    useAuthStore.getState().setCurrentUser(userMock)

    renderRouterAt(
      "/history/interview/unknown-record?kind=mockInterview&targetRoleId=all&timeRange=last30Days&page=1",
    )

    expect(
      await screen.findByText(i18n.t("history.mockDetail.notFound.title"), undefined, {
        timeout: 3_000,
      }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: i18n.t("history.mockDetail.notFound.action") }),
    )

    await waitFor(() => expect(window.location.pathname).toBe("/history"))
    expect(window.location.search).toContain("kind=mockInterview")
    expect(window.location.search).toContain("timeRange=last30Days")
  })
})
