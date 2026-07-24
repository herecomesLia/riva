import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import {
  createInterviewCompletedSessionMock,
  createInterviewReviewResponseMock,
} from "@/mocks/data/interview"
import { getInterviewReview } from "@/services/interview"
import { renderWithProviders } from "@/test/render"

import { InterviewReviewContainer } from "./InterviewReviewPage"

vi.mock("@/services/interview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/interview")>()),
  getInterviewReview: vi.fn(),
}))

const sessionId = "mock-interview-session-completed"

function completedReview() {
  const response = createInterviewReviewResponseMock()
  if (response.status !== "complete") throw new Error("Expected complete review.")
  return response
}

function unavailableReview() {
  const response = createInterviewReviewResponseMock(
    createInterviewCompletedSessionMock({
      completionReason: "userEndedEarly",
      completedMainQuestions: 0,
    }),
  )
  if (response.status !== "unavailable") throw new Error("Expected unavailable review.")
  return response
}

function partialReview() {
  const response = createInterviewReviewResponseMock(
    createInterviewCompletedSessionMock({
      completionReason: "userEndedEarly",
      completedMainQuestions: 1,
    }),
  )
  if (response.status !== "partial") throw new Error("Expected partial review.")
  return response
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

  it("renders service scores and expands a question summary without showing the answer transcript", async () => {
    const user = userEvent.setup()
    vi.mocked(getInterviewReview).mockResolvedValue(completedReview())
    renderReview()

    expect(await screen.findByText("82")).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: /请介绍一次你主导的前端性能优化/,
      }),
    )
    expect(
      screen.getByText("如果监控数据只能证明性能改善，却无法直接证明业务收益，你会如何补充验证？"),
    ).toBeVisible()
    expect(
      screen.queryByText(
        "我先通过真实用户监控定位长任务和资源瀑布，再分阶段实施拆包、预加载和渲染调度优化。",
      ),
    ).not.toBeInTheDocument()
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
    expect(await screen.findByText("82")).toBeVisible()
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

  it("shows a limited-data notice and only the completed question for a partial review", async () => {
    vi.mocked(getInterviewReview).mockResolvedValue(partialReview())
    renderReview()

    expect(await screen.findByText(i18n.t("interview.review.partialTitle"))).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: /请你用两分钟做一下自我介绍/,
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: /前端性能优化/,
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
