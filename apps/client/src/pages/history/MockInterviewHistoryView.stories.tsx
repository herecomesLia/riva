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

const generatingReferenceMockInterviewStoryFixture = structuredClone(
  completeMockInterviewHistoryStoryFixture,
)
generatingReferenceMockInterviewStoryFixture.questions[0].referenceAnswer = {
  status: "generating",
  content: null,
}

export const Complete = meta.story({
  args: {
    historySearch: defaultHistorySearch,
    onRetry: fn(),
    state: { status: "ready", data: completeMockInterviewHistoryStoryFixture },
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

export const ReferenceGenerating = meta.story({
  args: {
    historySearch: defaultHistorySearch,
    onRetry: fn(),
    state: { status: "ready", data: generatingReferenceMockInterviewStoryFixture },
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
