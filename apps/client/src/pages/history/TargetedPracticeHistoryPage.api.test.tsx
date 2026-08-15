import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { TargetedPracticeHistoryPage } from "@/pages/history/TargetedPracticeHistoryPage"
import { renderWithProviders } from "@/test/render"

const recordId = "11111111-1111-4111-8111-111111111111"
const timestamp = "2026-08-15T08:00:00Z"

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ recordId }),
}))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

function recordResponse(): Record<string, unknown> {
  return {
    recordId,
    kind: "targetedPractice",
    status: "completed",
    language: "zh-CN",
    startedAt: timestamp,
    endedAt: timestamp,
    durationSeconds: 0,
    targetRole: {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Backend Engineer",
      company: null,
    },
    setup: { source: "personalized", prioritizeWeaknesses: false },
    attempts: [
      {
        attemptId: "33333333-3333-4333-8333-333333333333",
        attemptNumber: 1,
        retryOfAttemptId: null,
        completedAt: timestamp,
        question: {
          questionCardId: "44444444-4444-4444-8444-444444444444",
          prompt: "Describe a project you owned.",
          questionType: "projectDeepDive",
          difficulty: "basic",
          assessedCapabilities: ["Ownership"],
          isSaved: false,
          isMarkedWeak: false,
          referenceAnswer: {
            status: "revealed",
            viewedBeforeSubmission: false,
            content: {
              kind: "technicalReference",
              answer: "Main reference answer",
              keyPoints: ["Context", "Trade-off"],
              commonMistakes: ["No evidence"],
              generatedAt: timestamp,
            },
          },
        },
        mainAnswer: {
          id: "55555555-5555-4555-8555-555555555555",
          content: "My project answer",
          createdAt: timestamp,
          order: 1,
        },
        followUps: [
          {
            questionId: "66666666-6666-4666-8666-666666666666",
            prompt: "What was the result?",
            order: 1,
            askedAt: timestamp,
            answer: {
              id: "77777777-7777-4777-8777-777777777777",
              content: "The result answer",
              createdAt: timestamp,
              order: 2,
            },
            referenceAnswer: {
              status: "revealed",
              viewedBeforeSubmission: false,
              content: {
                kind: "personalizedSupplement",
                addressedGap: "Add outcome evidence",
                answer: "Follow-up reference answer",
                keyPoints: ["Impact", "Evidence"],
                commonMistakes: ["Vague result"],
                generatedAt: timestamp,
              },
            },
          },
        ],
        evaluation: null,
        review: null,
        recommendation: null,
      },
    ],
    exposedWeaknesses: [],
    recommendation: null,
  }
}

describe("targeted practice history real API", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders revealed main and follow-up references without a generation action", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(recordResponse()))

    renderWithProviders(<TargetedPracticeHistoryPage />)

    const user = userEvent.setup()
    const referenceToggles = await screen.findAllByRole("button", {
      name: i18n.t("history.detail.reference.title"),
    })
    for (const referenceToggle of referenceToggles) {
      await user.click(referenceToggle)
    }

    expect(await screen.findByText("Main reference answer")).toBeInTheDocument()
    expect(screen.getByText("Follow-up reference answer")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: i18n.t("history.detail.reference.generate") }),
    ).not.toBeInTheDocument()
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/training-records/practice/${recordId}`)
  })

  it("renders the existing not-found state for a real API 404", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "training_record_not_found" }, 404))

    renderWithProviders(<TargetedPracticeHistoryPage />)

    expect(await screen.findByText(i18n.t("history.detail.notFound.title"))).toBeInTheDocument()
  })

  it("keeps a real API conflict retryable", async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "training_record_state_conflict" }, 409))
      .mockResolvedValueOnce(jsonResponse(recordResponse()))

    renderWithProviders(<TargetedPracticeHistoryPage />)

    await user.click(
      await screen.findByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )
    expect(await screen.findByText("Describe a project you owned.")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
