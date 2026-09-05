import preview from "#storybook/preview"
import { expect, userEvent } from "storybook/test"

import { createInterviewReviewStoryFixture } from "@/pages/interview/stories/interview-story-fixtures"
import type { InterviewReferenceAnswer as ReferenceAnswerState } from "@/models/interview-workflow"

import { InterviewReferenceAnswer } from "./InterviewReferenceAnswer"

const review = createInterviewReviewStoryFixture()
if (review.status !== "complete") throw new Error("Complete review fixture required.")
const readyReference = review.questionDetails[0]!.referenceAnswer
if (readyReference.status !== "ready") throw new Error("Ready reference fixture required.")

const generatingReference = {
  status: "generating",
} satisfies ReferenceAnswerState

const unavailableReference = {
  status: "unavailable",
} satisfies ReferenceAnswerState

const meta = preview.meta({
  component: InterviewReferenceAnswer,
  title: "Interview/InterviewReferenceAnswer",
})

export const Ready = meta.story({
  args: {
    referenceAnswer: readyReference,
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /查看 RIVA 示例回答/ }))
    await expect(canvas.getByText(readyReference.content.exampleAnswer)).toBeVisible()
  },
})

export const Generating = meta.story({
  args: {
    referenceAnswer: generatingReference,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/RIVA 参考答案正在生成|RIVA reference answer is being generated/i),
    ).toBeVisible()
  },
})

export const Unavailable = meta.story({
  args: {
    referenceAnswer: unavailableReference,
  },
})
