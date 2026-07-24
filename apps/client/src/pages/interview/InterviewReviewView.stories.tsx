import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { InterviewReviewView } from "./InterviewReviewView"

const meta = preview.meta({
  component: InterviewReviewView,
  title: "Pages/Interview/Review",
})

export const Generating = meta.story({
  args: { status: "generating" },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("interview-review-generating")).toHaveAttribute(
      "aria-busy",
      "true",
    )
  },
})

export const Ready = meta.story({
  args: {
    status: "ready",
    onBack: fn(),
  },
})

export const Error = meta.story({
  args: {
    status: "error",
    isRetrying: false,
    onRetry: fn(),
    onBack: fn(),
  },
})
