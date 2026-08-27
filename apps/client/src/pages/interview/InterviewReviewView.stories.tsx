import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"

import { createInterviewReviewResponseMock } from "@/mocks/data/interview"

import {
  createGeneratingReferenceReviewStoryFixture,
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

export const Generating = meta.story({
  args: {
    status: "generating",
    data: {
      status: "generating",
      sessionId: "mock-interview-session-generating",
      completionReason: "formalQuestionsCompleted",
    },
  },
})

export const GenerationFailed = meta.story({
  args: {
    status: "failed",
    data: {
      status: "failed",
      sessionId: "mock-interview-session-failed",
      completionReason: "userEndedEarly",
      reason: "generationFailed",
    },
    onBack: fn(),
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
    const detail = completeReview.questionDetails[1]!
    const followUp = detail.followUps[0]!
    const reference = detail.referenceAnswer
    if (reference.status !== "ready") throw new Error("Ready reference required.")
    await expect(canvas.getByText(String(completeReview.review.overallScore))).toBeVisible()
    await expect(canvas.getByText("个人贡献")).toBeVisible()
    await expect(canvas.getByText("结果与证据")).toBeVisible()
    await expect(canvas.getByText("岗位匹配")).toBeVisible()
    await expect(canvas.getByText("风险意识")).toBeVisible()
    await userEvent.click(
      canvas.getByRole("button", {
        name: new RegExp(detail.record.question.prompt.slice(0, 16)),
      }),
    )
    await expect(canvas.getByText(followUp.record.question.prompt)).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /查看 RIVA 示例回答/ }))
    await expect(canvas.getByText(reference.content.exampleAnswer)).toBeVisible()
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
    const prompt = partialReview.questionDetails[0]!.record.question.prompt
    const nextPrompt = completeReview.questionDetails[1]!.record.question.prompt
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(
      canvas.getAllByRole("button", { name: new RegExp(prompt.slice(0, 16)) }),
    ).toHaveLength(1)
    await expect(
      canvas.queryByRole("button", { name: new RegExp(nextPrompt.slice(0, 16)) }),
    ).not.toBeInTheDocument()
    await expect(
      canvas.queryByText(String(completeReview.review.overallScore)),
    ).not.toBeInTheDocument()
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
    const response = createPartialWithUnansweredQuestionStoryFixture()
    const detail = response.questionDetails.at(-1)!
    const reference = detail.referenceAnswer
    if (reference.status !== "ready") throw new Error("Ready reference required.")
    await userEvent.click(
      canvas.getByRole("button", {
        name: new RegExp(detail.record.question.prompt.slice(0, 16)),
      }),
    )
    await expect(canvas.getAllByText(/未作答/).length).toBeGreaterThan(0)
    await userEvent.click(canvas.getByRole("button", { name: /查看 RIVA 示例回答/ }))
    await expect(canvas.getByText(reference.content.exampleAnswer)).toBeVisible()
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
    const response = createPartialWithUnansweredFollowUpStoryFixture()
    const detail = response.questionDetails[1]!
    const followUp = detail.followUps[0]!
    await userEvent.click(
      canvas.getByRole("button", {
        name: new RegExp(detail.record.question.prompt.slice(0, 16)),
      }),
    )
    await userEvent.click(
      canvas.getByRole("button", {
        name: new RegExp(followUp.record.question.prompt.slice(0, 16)),
      }),
    )
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
    const response = createMultipleFollowUpsReviewStoryFixture()
    const detail = response.questionDetails[1]!
    await userEvent.click(
      canvas.getByRole("button", {
        name: new RegExp(detail.record.question.prompt.slice(0, 16)),
      }),
    )
    await expect(
      canvas.getByRole("button", {
        name: new RegExp(detail.followUps[0]!.record.question.prompt.slice(0, 16)),
      }),
    ).toBeVisible()
    await expect(
      canvas.getByRole("button", {
        name: new RegExp(detail.followUps[1]!.record.question.prompt.slice(0, 16)),
      }),
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
    const detail = unavailableWithLearning.questionDetails[0]!
    const reference = detail.referenceAnswer
    if (reference.status !== "ready") throw new Error("Ready reference required.")
    await userEvent.click(
      canvas.getByRole("button", {
        name: new RegExp(detail.record.question.prompt.slice(0, 16)),
      }),
    )
    await userEvent.click(canvas.getByRole("button", { name: /查看 RIVA 示例回答/ }))
    await expect(canvas.getByText(reference.content.exampleAnswer)).toBeVisible()
    await expect(canvas.queryByText(/^\d+ 分$/)).not.toBeInTheDocument()
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
    const detail = unavailableWithLearning.questionDetails[0]!
    await userEvent.click(
      canvas.getByRole("button", {
        name: new RegExp(detail.record.question.prompt.slice(0, 16)),
      }),
    )
    await expect(canvas.getByText(/参考答案暂不可用/)).toBeVisible()
  },
})

export const ReferenceGenerating = meta.story({
  args: {
    status: "complete",
    data: (() => {
      const response = createGeneratingReferenceReviewStoryFixture()
      if (response.status !== "complete") throw new Error("Complete review fixture required.")
      return response
    })(),
    onBack: fn(),
    onNextTraining: fn(),
  },
  play: async ({ canvas }) => {
    const response = createGeneratingReferenceReviewStoryFixture()
    const detail = response.questionDetails[0]!
    await userEvent.click(
      canvas.getByRole("button", {
        name: new RegExp(detail.record.question.prompt.slice(0, 16)),
      }),
    )
    await expect(
      canvas.getByText(/RIVA 参考答案正在生成|RIVA reference answer is being generated/i),
    ).toBeVisible()
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
    const detail = completeReview.questionDetails[0]!
    const reference = detail.referenceAnswer
    if (reference.status !== "ready") throw new Error("Ready reference required.")
    await userEvent.click(
      canvas.getByRole("button", {
        name: new RegExp(detail.record.question.prompt.slice(0, 16)),
      }),
    )
    await userEvent.click(canvas.getByRole("button", { name: /查看 RIVA 示例回答/ }))
    await expect(
      canvas.getByText(new RegExp(reference.content.exampleAnswer.slice(0, 24))),
    ).toBeVisible()
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
