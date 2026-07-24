import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"

import { createInterviewReviewResponseMock } from "@/mocks/data/interview"

import {
  createPartialInterviewReviewStoryFixture,
  createMultipleFollowUpsReviewStoryFixture,
  createPartialWithUnansweredFollowUpStoryFixture,
  createPartialWithUnansweredQuestionStoryFixture,
  createSparseInterviewReviewStoryFixture,
  createUnavailableInterviewReviewStoryFixture,
  createUnavailableReviewWithLearningStoryFixture,
} from "./stories/interview-story-fixtures"
import { InterviewReviewView } from "./InterviewReviewView"

const completeReview = createInterviewReviewResponseMock()
const partialReview = createPartialInterviewReviewStoryFixture()
const unavailableReview = createUnavailableInterviewReviewStoryFixture()
const unavailableWithLearning = createUnavailableReviewWithLearningStoryFixture()
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
    await expect(canvas.getByText("个人贡献")).toBeVisible()
    await expect(canvas.getByText("结果与证据")).toBeVisible()
    await expect(canvas.getByText("岗位匹配")).toBeVisible()
    await expect(canvas.getByText("风险意识")).toBeVisible()
    await userEvent.click(
      canvas.getByRole("button", {
        name: /请介绍一次你主导的前端性能优化/,
      }),
    )
    await expect(
      canvas.getByText("如果监控数据只能证明性能改善，却无法直接证明业务收益，你会如何补充验证？"),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /查看 RIVA 示例回答/ }))
    await expect(canvas.getByText(/项目的核心问题是活动期间首屏变慢/)).toBeVisible()
  },
})

export const Unavailable = meta.story({
  args: {
    status: "unavailable",
    data: unavailableReview,
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

export const PartialWithUnansweredQuestion = meta.story({
  args: {
    status: "partial",
    data: (() => {
      const response = createPartialWithUnansweredQuestionStoryFixture()
      if (response.status !== "partial") throw new Error("Partial review fixture required.")
      return response
    })(),
    onBack: fn(),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /存在明显分歧的跨团队项目/ }))
    await expect(canvas.getAllByText(/未作答/).length).toBeGreaterThan(0)
    await userEvent.click(canvas.getByRole("button", { name: /查看 RIVA 示例回答/ }))
    await expect(canvas.getByText(/在一次结算链路改造中/)).toBeVisible()
  },
})

export const AnsweredMainWithUnansweredFollowUp = meta.story({
  args: {
    status: "partial",
    data: (() => {
      const response = createPartialWithUnansweredFollowUpStoryFixture()
      if (response.status !== "partial") throw new Error("Partial review fixture required.")
      return response
    })(),
    onBack: fn(),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /请介绍一次你主导的前端性能优化/ }))
    await userEvent.click(canvas.getByRole("button", { name: /如果监控数据只能证明性能改善/ }))
    await expect(canvas.getAllByText(/未作答/).length).toBeGreaterThan(0)
  },
})

export const MultipleFollowUps = meta.story({
  args: {
    status: "complete",
    data: (() => {
      const response = createMultipleFollowUpsReviewStoryFixture()
      if (response.status !== "complete") throw new Error("Complete review fixture required.")
      return response
    })(),
    onBack: fn(),
    onNextTraining: fn(),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /请介绍一次你主导的前端性能优化/ }))
    await expect(canvas.getByRole("button", { name: /如果监控数据只能证明性能改善/ })).toBeVisible()
    await expect(
      canvas.getByRole("button", { name: /如果同期还有营销活动和服务端改动/ }),
    ).toBeVisible()
  },
})

export const UnavailableWithLearning = meta.story({
  args: {
    status: "unavailable",
    data: (() => {
      if (unavailableWithLearning.status !== "unavailable") {
        throw new Error("Unavailable review fixture required.")
      }
      return unavailableWithLearning
    })(),
    onBack: fn(),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /请你用两分钟做一下自我介绍/ }))
    await userEvent.click(canvas.getByRole("button", { name: /查看 RIVA 示例回答/ }))
    await expect(canvas.getByText(/我有五年前端研发经验/)).toBeVisible()
    await expect(canvas.queryByText(/84 分/)).not.toBeInTheDocument()
  },
})

export const ReferenceUnavailable = meta.story({
  args: {
    status: "unavailable",
    data: (() => {
      if (unavailableWithLearning.status !== "unavailable") {
        throw new Error("Unavailable review fixture required.")
      }
      const response = structuredClone(unavailableWithLearning)
      response.questionDetails[0]!.referenceAnswer = {
        status: "unavailable",
        reason: "generationFailed",
      }
      return response
    })(),
    onBack: fn(),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /请你用两分钟做一下自我介绍/ }))
    await expect(canvas.getByText(/参考答案暂不可用/)).toBeVisible()
  },
})

export const LongReferenceAnswer = meta.story({
  args: {
    status: "complete",
    data: (() => {
      const response = structuredClone(completeReview)
      const reference = response.questionDetails[0]!.referenceAnswer
      if (reference.status !== "ready") throw new Error("Ready reference answer required.")
      reference.content.exampleAnswer = `${reference.content.exampleAnswer}${reference.content.exampleAnswer}${reference.content.exampleAnswer}`
      return response
    })(),
    onBack: fn(),
    onNextTraining: fn(),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /请你用两分钟做一下自我介绍/ }))
    await userEvent.click(canvas.getByRole("button", { name: /查看 RIVA 示例回答/ }))
    await expect(canvas.getByText(/我有五年前端研发经验/)).toBeVisible()
  },
})

export const NarrowScreen = meta.story({
  args: {
    status: "unavailable",
    data: (() => {
      if (unavailableWithLearning.status !== "unavailable") {
        throw new Error("Unavailable review fixture required.")
      }
      return unavailableWithLearning
    })(),
    onBack: fn(),
  },
  globals: { viewport: { isRotated: false, value: "mobile1" } },
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
