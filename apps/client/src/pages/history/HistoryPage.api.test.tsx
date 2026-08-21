import { screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HistoryPage } from "@/pages/history"
import { renderWithProviders } from "@/test/render"

const recordId = "11111111-1111-4111-8111-111111111111"
const roleId = "22222222-2222-4222-8222-222222222222"
const timestamp = "2026-08-15T08:00:00Z"

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  })
}

function overviewResponse() {
  return {
    totalRecordCount: 2,
    completedRecordCount: 1,
    totalDurationSeconds: 600,
    answeredQuestionCount: 1,
    averageScore: 86,
    targetRoles: [{ id: roleId, title: "Backend Engineer", company: "Riva" }],
    byKind: {
      targetedPractice: { recordCount: 2, completedRecordCount: 1, averageScore: 86 },
      mockInterview: { recordCount: 0, completedRecordCount: 0, averageScore: null },
    },
  }
}

function listResponse() {
  return {
    items: [
      {
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
      },
    ],
    pagination: {
      page: 1,
      pageSize: 3,
      totalItems: 1,
      totalPages: 1,
    },
  }
}

describe("HistoryPage real API smoke", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("loads overview and records through the real service boundary", async () => {
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), "http://localhost")
      return Promise.resolve(
        jsonResponse(
          url.pathname === "/api/training-records/overview" ? overviewResponse() : listResponse(),
        ),
      )
    })

    renderWithProviders(<HistoryPage />, {
      router: { initialEntries: ["/history"] },
    })

    expect(await screen.findByText("Strong ownership evidence.")).toBeInTheDocument()

    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input), "http://localhost"))
    expect(urls.some((url) => url.pathname === "/api/training-records/overview")).toBe(true)
    const listUrl = urls.find((url) => url.pathname === "/api/training-records")
    expect(listUrl?.searchParams.get("page")).toBe("1")
    expect(listUrl?.searchParams.get("pageSize")).toBe("3")
  })
})
