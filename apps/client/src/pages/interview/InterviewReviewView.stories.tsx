import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"

import { createInterviewReviewResponseMock } from "@/mocks/data/interview"

import { InterviewReviewView } from "./InterviewReviewView"

const meta = preview.meta({
  component: InterviewReviewView,
  title: "Pages/Interview/Review",
})

export const Loading = meta.story({
  args: { status: "loading" },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("interview-review-loading")).toHaveAttribute(
      "aria-busy",
      "true",
    )
  },
})

export const Ready = meta.story({
  args: {
    status: "ready",
    data: createInterviewReviewResponseMock(),
    onBack: fn(),
    onNextTraining: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("82")).toBeVisible()
    await userEvent.click(
      canvas.getByRole("button", {
        name: /请介绍一次你主导的前端性能优化/,
      }),
    )
    await expect(
      canvas.getByText("如果监控数据只能证明性能改善，却无法直接证明业务收益，你会如何补充验证？"),
    ).toBeVisible()
  },
})

export const Empty = meta.story({
  args: {
    status: "empty",
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
