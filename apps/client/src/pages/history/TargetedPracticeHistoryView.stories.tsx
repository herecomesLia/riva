import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"

import {
  completedTargetedPracticeHistoryStoryFixture,
  endedTargetedPracticeHistoryStoryFixture,
  partialTargetedPracticeHistoryStoryFixture,
} from "./stories/targeted-practice-history-story-fixtures"
import { TargetedPracticeHistoryView } from "./TargetedPracticeHistoryView"

const meta = preview.meta({
  component: TargetedPracticeHistoryView,
  decorators: [withRouter],
  parameters: {
    router: { initialEntries: ["/history/practice/targeted-practice-record-001"] },
  },
  title: "Pages/History/Targeted Practice Detail",
})

export const Complete = meta.story({
  args: {
    onRetry: fn(),
    state: { status: "ready", data: completedTargetedPracticeHistoryStoryFixture },
  },
})

export const Partial = meta.story({
  args: {
    onRetry: fn(),
    state: { status: "ready", data: partialTargetedPracticeHistoryStoryFixture },
  },
})

export const EndedEarly = meta.story({
  args: {
    onRetry: fn(),
    state: { status: "ready", data: endedTargetedPracticeHistoryStoryFixture },
  },
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
