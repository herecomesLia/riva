import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"

import {
  completeMockInterviewHistoryStoryFixture,
  partialMockInterviewHistoryStoryFixture,
  unavailableReviewMockInterviewHistoryStoryFixture,
} from "./stories/mock-interview-history-story-fixtures"
import { MockInterviewHistoryView } from "./MockInterviewHistoryView"

const meta = preview.meta({
  component: MockInterviewHistoryView,
  decorators: [withRouter],
  parameters: {
    router: { initialEntries: ["/history/interview/mock-interview-record-001"] },
  },
  title: "Pages/History/Mock Interview Detail",
})

export const Complete = meta.story({
  args: {
    onRetry: fn(),
    state: { status: "ready", data: completeMockInterviewHistoryStoryFixture },
  },
})

export const EndedEarlyWithPartialReview = meta.story({
  args: {
    onRetry: fn(),
    state: { status: "ready", data: partialMockInterviewHistoryStoryFixture },
  },
})

export const ReviewUnavailable = meta.story({
  args: {
    onRetry: fn(),
    state: { status: "ready", data: unavailableReviewMockInterviewHistoryStoryFixture },
  },
})

export const WithUnansweredQuestion = meta.story({
  args: EndedEarlyWithPartialReview.input.args,
})

export const ReferenceGenerating = meta.story({
  args: Complete.input.args,
})

export const Loading = meta.story({
  args: { onRetry: fn(), state: { status: "loading" } },
})

const onRetry = fn()
export const Error = meta.story({
  args: { onRetry, state: { status: "error", isRetrying: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /重新加载|reload/i }))
    await expect(onRetry).toHaveBeenCalledOnce()
  },
})

export const NotFound = meta.story({
  args: { onRetry: fn(), state: { status: "notFound" } },
})
