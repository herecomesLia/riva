import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { HistoryPage } from "@/pages/history"
import { renderWithProviders } from "@/test/render"

const recordId = "11111111-1111-4111-8111-111111111111"
const roleId = "22222222-2222-4222-8222-222222222222"
const timestamp = "2026-08-15T08:00:00Z"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

function overviewResponse(totalRecordCount = 2) {
  return {
    totalRecordCount,
    completedRecordCount: totalRecordCount ? 1 : 0,
    totalDurationSeconds: totalRecordCount ? 600 : 0,
    answeredQuestionCount: totalRecordCount ? 1 : 0,
    averageScore: totalRecordCount ? 86 : null,
    targetRoles: totalRecordCount
      ? [{ id: roleId, title: "Backend Engineer", company: "Riva" }]
      : [],
    byKind: {
      targetedPractice: {
        recordCount: totalRecordCount,
        completedRecordCount: totalRecordCount ? 1 : 0,
        averageScore: totalRecordCount ? 86 : null,
      },
      mockInterview: { recordCount: 0, completedRecordCount: 0, averageScore: null },
    },
  }
}

function summaryResponse() {
  return {
    recordId,
    kind: "targetedPractice",
    language: "en",
    status: "completed",
    startedAt: timestamp,
    endedAt: timestamp,
    durationSeconds: 600,
    targetRole: { id: roleId, title: "Backend Engineer", company: "Riva" },
    answeredQuestionCount: 1,
    totalQuestionCount: 1,
    overallScore: 86,
    reviewSummary: "Strong ownership evidence.",
    questionType: "behavioral",
    difficulty: "basic",
  }
}

function listResponse(page = 1, items = [summaryResponse()]) {
  return {
    items,
    pagination: {
      page,
      pageSize: 3,
      totalItems: items.length ? 2 : 0,
      totalPages: items.length ? 2 : 0,
    },
  }
}

function renderHistoryPage() {
  return renderWithProviders(<HistoryPage />, {
    router: { initialEntries: ["/history"] },
  })
}

function requestUrls(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetchMock.mock.calls.map(([input]) => new URL(String(input), "http://localhost"))
}

describe("HistoryPage real API integration", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("loads overview metrics, role filters, and records from the real endpoints", async () => {
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), "http://localhost")
      if (url.pathname === "/api/training-records/overview") {
        return Promise.resolve(jsonResponse(overviewResponse()))
      }
      return Promise.resolve(
        jsonResponse(listResponse(Number(url.searchParams.get("page") ?? "1"))),
      )
    })

    renderHistoryPage()

    expect(await screen.findByText("Strong ownership evidence.")).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("history.overview.values.records", { count: 2 })),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("combobox", { name: i18n.t("history.filters.roleLabel") }),
    ).toBeInTheDocument()

    const urls = requestUrls(fetchMock)
    expect(urls.some((url) => url.pathname === "/api/training-records/overview")).toBe(true)
    const listUrl = urls.find((url) => url.pathname === "/api/training-records")
    expect(listUrl?.searchParams.get("page")).toBe("1")
    expect(listUrl?.searchParams.get("pageSize")).toBe("3")
  })

  it("sends the targeted-practice kind filter and resets to page one", async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), "http://localhost")
      return Promise.resolve(
        jsonResponse(
          url.pathname === "/api/training-records/overview"
            ? overviewResponse()
            : listResponse(Number(url.searchParams.get("page") ?? "1")),
        ),
      )
    })

    renderHistoryPage()
    await screen.findByText("Strong ownership evidence.")
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("history.filters.kinds.targetedPractice"),
      }),
    )

    await waitFor(() => {
      const lists = requestUrls(fetchMock).filter((url) => url.pathname === "/api/training-records")
      const request = lists.at(-1)
      expect(request?.searchParams.getAll("kinds")).toEqual(["targetedPractice"])
      expect(request?.searchParams.get("page")).toBe("1")
    })
  })

  it("sends the selected target role and time range", async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), "http://localhost")
      return Promise.resolve(
        jsonResponse(
          url.pathname === "/api/training-records/overview"
            ? overviewResponse()
            : listResponse(Number(url.searchParams.get("page") ?? "1")),
        ),
      )
    })

    renderHistoryPage()
    await screen.findByText("Strong ownership evidence.")
    await user.click(screen.getByRole("combobox", { name: i18n.t("history.filters.roleLabel") }))
    await user.click(await screen.findByRole("option", { name: /Backend Engineer.*Riva/ }))

    await waitFor(() => {
      const request = requestUrls(fetchMock)
        .filter((url) => url.pathname === "/api/training-records")
        .at(-1)
      expect(request?.searchParams.get("targetRoleId")).toBe(roleId)
      expect(request?.searchParams.get("page")).toBe("1")
    })

    await user.click(screen.getByRole("combobox", { name: i18n.t("history.filters.periodLabel") }))
    await user.click(
      await screen.findByRole("option", {
        name: i18n.t("history.filters.periods.last7Days"),
      }),
    )

    await waitFor(() => {
      const request = requestUrls(fetchMock)
        .filter((url) => url.pathname === "/api/training-records")
        .at(-1)
      const startedAtFrom = request?.searchParams.get("startedAtFrom")
      expect(startedAtFrom).toBeTruthy()
      expect(Number.isNaN(Date.parse(startedAtFrom ?? ""))).toBe(false)
      expect(request?.searchParams.get("targetRoleId")).toBe(roleId)
    })
  })

  it("keeps filters while requesting another page", async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), "http://localhost")
      return Promise.resolve(
        jsonResponse(
          url.pathname === "/api/training-records/overview"
            ? overviewResponse()
            : listResponse(Number(url.searchParams.get("page") ?? "1")),
        ),
      )
    })

    renderHistoryPage()
    await screen.findByText("Strong ownership evidence.")
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("history.filters.kinds.targetedPractice"),
      }),
    )
    await waitFor(() => {
      const request = requestUrls(fetchMock)
        .filter((url) => url.pathname === "/api/training-records")
        .at(-1)
      expect(request?.searchParams.getAll("kinds")).toEqual(["targetedPractice"])
    })

    await user.click(await screen.findByRole("button", { name: i18n.t("history.pagination.next") }))
    await waitFor(() => {
      const request = requestUrls(fetchMock)
        .filter((url) => url.pathname === "/api/training-records")
        .at(-1)
      expect(request?.searchParams.get("page")).toBe("2")
      expect(request?.searchParams.get("pageSize")).toBe("3")
      expect(request?.searchParams.getAll("kinds")).toEqual(["targetedPractice"])
    })
  })

  it.each(["overview", "list"] as const)(
    "shows the error state and retries both real endpoints when %s fails",
    async (failingEndpoint) => {
      const user = userEvent.setup()
      const calls = { overview: 0, list: 0 }
      fetchMock.mockImplementation((input) => {
        const url = new URL(String(input), "http://localhost")
        const endpoint = url.pathname.endsWith("/overview") ? "overview" : "list"
        calls[endpoint] += 1
        if (endpoint === failingEndpoint && calls[endpoint] === 1) {
          return Promise.resolve(jsonResponse({ error: "temporary_failure" }, 500))
        }
        return Promise.resolve(
          jsonResponse(
            endpoint === "overview"
              ? overviewResponse()
              : listResponse(Number(url.searchParams.get("page") ?? "1")),
          ),
        )
      })

      renderHistoryPage()
      expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("history.error.title"))
      await user.click(screen.getByRole("button", { name: i18n.t("common.pageState.error.retry") }))

      expect(await screen.findByText("Strong ownership evidence.")).toBeInTheDocument()
      expect(calls).toEqual({ overview: 2, list: 2 })
    },
  )

  it("shows never-trained when the overview has no records", async () => {
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), "http://localhost")
      return Promise.resolve(
        jsonResponse(
          url.pathname === "/api/training-records/overview"
            ? overviewResponse(0)
            : listResponse(1, []),
        ),
      )
    })

    renderHistoryPage()

    expect(await screen.findByText(i18n.t("history.empty.neverTrained.title"))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("history.empty.noMatches.title"))).not.toBeInTheDocument()
  })

  it("shows no-matches when records exist but the current list is empty", async () => {
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), "http://localhost")
      return Promise.resolve(
        jsonResponse(
          url.pathname === "/api/training-records/overview"
            ? overviewResponse()
            : listResponse(1, []),
        ),
      )
    })

    renderHistoryPage()

    expect(await screen.findByText(i18n.t("history.empty.noMatches.title"))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("history.empty.neverTrained.title"))).not.toBeInTheDocument()
  })
})
