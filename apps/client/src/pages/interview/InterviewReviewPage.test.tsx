import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { getInterviewReview } from "@/services/interview"
import { renderWithProviders } from "@/test/render"

import { InterviewReviewContainer } from "./InterviewReviewPage"
import {
  createInterviewReviewStoryFixture,
  createPartialInterviewReviewStoryFixture,
  createUnavailableInterviewReviewStoryFixture,
  createPartialWithUnansweredFollowUpStoryFixture,
  createPartialWithUnansweredQuestionStoryFixture,
  createUnavailableReviewWithLearningStoryFixture,
} from "./stories/interview-story-fixtures"

vi.mock("@/services/interview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/interview")>()),
  getInterviewReview: vi.fn(),
}))

const sessionId = "mock-interview-session-completed"

function completedReview() {
  const response = createInterviewReviewStoryFixture()
  if (response.status !== "complete") throw new Error("Expected complete review.")
  return response
}

const unavailableReview = createUnavailableInterviewReviewStoryFixture
const partialReview = createPartialInterviewReviewStoryFixture

function renderReview() {
  return renderWithProviders(<InterviewReviewContainer sessionId={sessionId} />, {
    router: { initialEntries: [`/interview/review/${sessionId}`] },
  })
}

describe("InterviewReviewContainer", () => {
  beforeEach(() => {
    vi.mocked(getInterviewReview).mockReset()
  })

  it("keeps the page title and section structure while the review loads", async () => {
    vi.mocked(getInterviewReview).mockReturnValue(new Promise(() => undefined))
    renderReview()

    expect(
      await screen.findByRole("heading", {
        name: i18n.t("interview.review.title"),
        level: 1,
      }),
    ).toBeVisible()
    expect(screen.getByTestId("interview-review-loading")).toHaveAttribute("aria-busy", "true")
    expect(screen.getByText(i18n.t("interview.review.sections.questions"))).toBeVisible()
  })

  it("renders an explicit terminal generation failure without offering a GET retry", async () => {
    vi.mocked(getInterviewReview).mockResolvedValue({
      status: "failed",
    })
    renderReview()

    expect(
      await screen.findByText(i18n.t("interview.review.failed.generationFailed.title")),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: i18n.t("interview.review.actions.retry") }),
    ).not.toBeInTheDocument()
  })

  it("renders the saved answer, feedback, and a separately collapsed reference answer", async () => {
    const user = userEvent.setup()
    const response = completedReview()
    const detail = response.questionDetails[1]!
    const followUp = detail.followUps[0]!
    const reference = detail.referenceAnswer
    if (detail.answer === null || reference.status !== "ready") {
      throw new Error("Expected answered question with reference.")
    }
    vi.mocked(getInterviewReview).mockResolvedValue(response)
    renderReview()

    expect(await screen.findByText(String(response.review.overallScore))).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(detail.prompt.slice(0, 16)),
      }),
    )
    expect(screen.getByText(followUp.prompt)).toBeVisible()
    expect(screen.getByText(detail.answer!)).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: i18n.t("interview.review.reference.view") }),
    )
    expect(screen.getByText(reference.content.exampleAnswer)).toBeVisible()
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
    expect(await screen.findByText(String(completedReview().review.overallScore))).toBeVisible()
    expect(getInterviewReview).toHaveBeenCalledTimes(2)
  })

  it("shows the service-provided unavailable state without scores or dimensions", async () => {
    vi.mocked(getInterviewReview).mockResolvedValue(unavailableReview())
    renderReview()

    expect(
      await screen.findByText(i18n.t("interview.review.unavailable.insufficientAnswers.title")),
    ).toBeVisible()
    expect(screen.queryByText("82")).not.toBeInTheDocument()
    expect(
      screen.queryByText(i18n.t("interview.review.sections.dimensions")),
    ).not.toBeInTheDocument()
  })

  it("keeps learning details available when overall scoring is unavailable", async () => {
    const user = userEvent.setup()
    const response = createUnavailableReviewWithLearningStoryFixture()
    const detail = response.questionDetails[0]!
    const reference = detail.referenceAnswer
    if (reference.status !== "ready") throw new Error("Expected ready reference.")
    vi.mocked(getInterviewReview).mockResolvedValue(response)
    renderReview()

    const question = await screen.findByRole("button", {
      name: new RegExp(detail.prompt.slice(0, 16)),
    })
    await user.click(question)
    expect(screen.getAllByText(i18n.t("interview.review.unanswered")).length).toBeGreaterThan(0)
    expect(screen.queryByText(/^\d+ 分$/)).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("interview.review.questionStrengths"))).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: i18n.t("interview.review.reference.view") }),
    )
    expect(screen.getByText(reference.content.exampleAnswer)).toBeVisible()
  })

  it("shows an unanswered current question in a partial review without performance", async () => {
    const user = userEvent.setup()
    const response = createPartialWithUnansweredQuestionStoryFixture()
    const unanswered = response.questionDetails.at(-1)!
    const reference = unanswered.referenceAnswer
    if (reference.status !== "ready") throw new Error("Expected ready reference.")
    vi.mocked(getInterviewReview).mockResolvedValue(response)
    renderReview()

    const question = await screen.findByRole("button", {
      name: new RegExp(unanswered.prompt.slice(0, 16)),
    })
    expect(within(question).getByText(i18n.t("interview.review.unanswered"))).toBeVisible()
    expect(within(question).queryByText(/^\d+ 分$/)).not.toBeInTheDocument()
    await user.click(question)
    expect(screen.queryByText(reference.content.exampleAnswer)).not.toBeInTheDocument()
    await user.click(
      screen.getAllByRole("button", {
        name: i18n.t("interview.review.reference.view"),
      })[0]!,
    )
    expect(screen.getByText(reference.content.exampleAnswer)).toBeVisible()
  })

  it("uses a follow-up-specific reference answer when the follow-up was not answered", async () => {
    const user = userEvent.setup()
    const response = createPartialWithUnansweredFollowUpStoryFixture()
    const detail = response.questionDetails[1]!
    const followUp = detail.followUps[0]!
    const mainReference = detail.referenceAnswer
    const followUpReference = followUp.referenceAnswer
    if (mainReference.status !== "ready" || followUpReference.status !== "ready") {
      throw new Error("Expected ready references.")
    }
    vi.mocked(getInterviewReview).mockResolvedValue(response)
    renderReview()

    await user.click(
      await screen.findByRole("button", {
        name: new RegExp(detail.prompt.slice(0, 16)),
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(followUp.prompt.slice(0, 16)),
      }),
    )
    const referenceButtons = screen.getAllByRole("button", {
      name: i18n.t("interview.review.reference.view"),
    })
    await user.click(referenceButtons.at(-1)!)
    expect(screen.getByText(followUpReference.content.exampleAnswer)).toBeVisible()
    expect(screen.queryByText(mainReference.content.exampleAnswer)).not.toBeInTheDocument()
  })

  it("shows a limited-data notice and only the completed question for a partial review", async () => {
    const response = partialReview()
    const prompt = response.questionDetails[0]!.prompt
    const nextPrompt = completedReview().questionDetails[1]!.prompt
    vi.mocked(getInterviewReview).mockResolvedValue(response)
    renderReview()

    expect(await screen.findByText(i18n.t("interview.review.partialTitle"))).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: new RegExp(prompt.slice(0, 16)),
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: new RegExp(nextPrompt.slice(0, 16)),
      }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText("82")).not.toBeInTheDocument()
    expect(
      screen.queryByText(i18n.t("interview.review.sections.nextTraining")),
    ).not.toBeInTheDocument()
  })

  it("navigates to the existing targeted-practice route from the service recommendation", async () => {
    const user = userEvent.setup()
    vi.mocked(getInterviewReview).mockResolvedValue(completedReview())
    const { router } = renderReview()

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("interview.review.actions.startTargetedPractice"),
      }),
    )
    await waitFor(() => expect(router?.state.location.pathname).toBe("/practice"))
  })
})
