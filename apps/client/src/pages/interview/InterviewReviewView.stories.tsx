import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"

import { createInterviewReviewResponseMock } from "@/mocks/data/interview"

import {
  createPartialInterviewReviewStoryFixture,
  createSparseInterviewReviewStoryFixture,
  createUnavailableInterviewReviewStoryFixture,
} from "./stories/interview-story-fixtures"
import { InterviewReviewView } from "./InterviewReviewView"

const completeReview = createInterviewReviewResponseMock()
const partialReview = createPartialInterviewReviewStoryFixture()
const unavailableReview = createUnavailableInterviewReviewStoryFixture()
if (completeReview.status !== "complete") throw new Error("Complete review fixture required.")
if (partialReview.status !== "partial") throw new Error("Partial review fixture required.")
if (unavailableReview.status !== "unavailable") {
  throw new Error("Unavailable review fixture required.")
}

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

export const Complete = meta.story({
  args: {
    status: "complete",
    data: completeReview,
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

export const Unavailable = meta.story({
  args: {
    status: "unavailable",
    reason: unavailableReview.reason,
    onBack: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("82")).not.toBeInTheDocument()
    await expect(canvas.queryByText(/能力维度|capability dimensions/i)).not.toBeInTheDocument()
  },
})

export const Partial = meta.story({
  args: {
    status: "partial",
    data: partialReview,
    onBack: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(
      canvas.getAllByRole("button", { name: /请你用两分钟做一下自我介绍/ }),
    ).toHaveLength(1)
    await expect(canvas.queryByRole("button", { name: /前端性能优化/ })).not.toBeInTheDocument()
    await expect(canvas.queryByText("82")).not.toBeInTheDocument()
  },
})

export const SparseData = meta.story({
  args: {
    status: "complete",
    data: (() => {
      const response = createSparseInterviewReviewStoryFixture()
      if (response.status !== "complete") throw new Error("Complete sparse review required.")
      return response
    })(),
    onBack: fn(),
    onNextTraining: fn(),
  },
})

const retryReview = fn()

export const LoadError = meta.story({
  args: {
    status: "error",
    isRetrying: false,
    onRetry: retryReview,
    onBack: fn(),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /重新生成|generate again/i }))
    await expect(retryReview).toHaveBeenCalledTimes(1)
  },
})
