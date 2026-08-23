import preview from "#storybook/preview"
import { expect, userEvent } from "storybook/test"

import { createInterviewReviewResponseMock } from "@/mocks/data/interview"
import type { InterviewReferenceAnswerResponse } from "@/models/interview"

import { InterviewReferenceAnswer } from "./InterviewReferenceAnswer"

const review = createInterviewReviewResponseMock()
if (review.status !== "complete") throw new Error("Complete review fixture required.")
const readyReference = review.questionDetails[0]!.referenceAnswer
if (readyReference.status !== "ready") throw new Error("Ready reference fixture required.")

const unavailableReference = {
  status: "unavailable",
  reason: "generationFailed",
} satisfies InterviewReferenceAnswerResponse

const meta = preview.meta({
  component: InterviewReferenceAnswer,
  title: "Interview/InterviewReferenceAnswer",
})

export const Ready = meta.story({
  args: {
    id: "ready-reference",
    referenceAnswer: readyReference,
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /查看 RIVA 示例回答/ }))
    await expect(canvas.getByText(readyReference.content.exampleAnswer)).toBeVisible()
  },
})

export const Unavailable = meta.story({
  args: {
    id: "unavailable-reference",
    referenceAnswer: unavailableReference,
  },
})
