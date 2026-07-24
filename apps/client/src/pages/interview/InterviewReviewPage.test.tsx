import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { createInterviewMockResponse } from "@/mocks/data/interview"
import { getInterviewReview } from "@/services/interview"
import { renderWithProviders } from "@/test/render"

import { InterviewReviewContainer } from "./InterviewReviewPage"

vi.mock("@/services/interview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/interview")>()),
  getInterviewReview: vi.fn(),
}))

const sessionId = "mock-interview-session-completed"

function completedReview() {
  const response = createInterviewMockResponse("completed")
  if (response.session?.status !== "completed") throw new Error("Expected completed fixture.")
  return {
    sessionId,
    review: response.session.review,
  }
}

function renderReview() {
  return renderWithProviders(<InterviewReviewContainer sessionId={sessionId} />, {
    router: { initialEntries: [`/interview/review/${sessionId}`] },
  })
}

describe("InterviewReviewContainer", () => {
  beforeEach(() => {
    vi.mocked(getInterviewReview).mockReset()
  })

  it("shows generation state before the review service resolves", async () => {
    vi.mocked(getInterviewReview).mockReturnValue(new Promise(() => undefined))
    renderReview()

    expect(
      await screen.findByRole("heading", {
        name: i18n.t("interview.review.generatingTitle"),
      }),
    ).toBeVisible()
    expect(screen.getByTestId("interview-review-generating")).toHaveAttribute("aria-busy", "true")
  })

  it("renders the generated state without exposing scores", async () => {
    vi.mocked(getInterviewReview).mockResolvedValue(completedReview())
    renderReview()

    expect(
      await screen.findByRole("heading", {
        name: i18n.t("interview.review.readyTitle"),
      }),
    ).toBeVisible()
    expect(screen.queryByText(/82|overall score|总分/i)).not.toBeInTheDocument()
  })

  it("retries review generation after a failure", async () => {
    const user = userEvent.setup()
    vi.mocked(getInterviewReview)
      .mockRejectedValueOnce(new Error("review failed"))
      .mockResolvedValueOnce(completedReview())
    renderReview()

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("interview.review.actions.retry"),
      }),
    )
    expect(
      await screen.findByRole("heading", {
        name: i18n.t("interview.review.readyTitle"),
      }),
    ).toBeVisible()
    expect(getInterviewReview).toHaveBeenCalledTimes(2)
  })
})
