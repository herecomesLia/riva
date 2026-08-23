import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"

import {
  completeMockInterviewHistoryStoryFixture,
  partialMockInterviewHistoryStoryFixture,
  unavailableReviewMockInterviewHistoryStoryFixture,
} from "./stories/mock-interview-history-story-fixtures"
import { defaultHistorySearch } from "./history-navigation"
import { MockInterviewHistoryView } from "./MockInterviewHistoryView"

const meta = preview.meta({
  component: MockInterviewHistoryView,
  decorators: [withRouter],
  parameters: {
    router: { initialEntries: ["/history/interview/mock-interview-record-001"] },
  },
  title: "Pages/History/Mock Interview",
})

const unansweredMockInterviewStoryFixture = structuredClone(
  completeMockInterviewHistoryStoryFixture,
)
unansweredMockInterviewStoryFixture.questions[0].answer = null
unansweredMockInterviewStoryFixture.questions[0].evaluation = null
unansweredMockInterviewStoryFixture.questions[0].review = null

export const Complete = meta.story({
  args: {
    historySearch: defaultHistorySearch,
    onRetry: fn(),
    state: { status: "ready", data: completeMockInterviewHistoryStoryFixture },
  },
  play: async ({ canvas }) => {
    const exchange = completeMockInterviewHistoryStoryFixture.candidateQuestionExchanges[0]!
    await expect(canvas.getByText(exchange.question)).toBeVisible()
    await expect(canvas.getByText(/^RIVA 提问分析$|^RIVA Question Analysis$/i)).toBeVisible()
    await expect(
      canvas.getByText(/不代表真实公司内部信息|does not represent real company/i),
    ).toBeVisible()
    await expect(canvas.queryByText(/面试官回答|interviewer answer/i)).not.toBeInTheDocument()
  },
})

const noCandidateAnalysisFixture = structuredClone(completeMockInterviewHistoryStoryFixture)
noCandidateAnalysisFixture.candidateQuestionExchanges[0]!.interviewerAnswer = ""
noCandidateAnalysisFixture.candidateQuestionExchanges[0]!.feedback = ""

export const CandidateAnalysisUnavailable = meta.story({
  args: {
    historySearch: defaultHistorySearch,
    onRetry: fn(),
    state: { status: "ready", data: noCandidateAnalysisFixture },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/暂无提问分析|No question analysis available/i)).toBeVisible()
  },
})

export const EndedEarlyWithPartialReview = meta.story({
  args: {
    historySearch: defaultHistorySearch,
    onRetry: fn(),
    state: { status: "ready", data: partialMockInterviewHistoryStoryFixture },
  },
})

export const ReviewUnavailable = meta.story({
  args: {
    historySearch: defaultHistorySearch,
    onRetry: fn(),
    state: { status: "ready", data: unavailableReviewMockInterviewHistoryStoryFixture },
  },
})

export const WithUnansweredQuestion = meta.story({
  args: {
    historySearch: defaultHistorySearch,
    onRetry: fn(),
    state: { status: "ready", data: unansweredMockInterviewStoryFixture },
  },
})

export const Loading = meta.story({
  args: {
    historySearch: defaultHistorySearch,
    onRetry: fn(),
    state: { status: "loading" },
  },
})

const onRetry = fn()
export const Error = meta.story({
  args: {
    historySearch: defaultHistorySearch,
    onRetry,
    state: { status: "error", isRetrying: false },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /重新加载|reload/i }))
    await expect(onRetry).toHaveBeenCalledOnce()
  },
})

export const NotFound = meta.story({
  args: {
    historySearch: defaultHistorySearch,
    onRetry: fn(),
    state: { status: "notFound" },
  },
})
