import preview from "#storybook/preview"
import { expect, userEvent } from "storybook/test"

import { createInterviewReviewStoryFixture } from "@/pages/interview/stories/interview-story-fixtures"

import { InterviewQuestionDetails } from "./InterviewQuestionDetails"

const response = createInterviewReviewStoryFixture()
if (response.status !== "complete") throw new Error("Complete review fixture required.")

const meta = preview.meta({
  component: InterviewQuestionDetails,
  title: "Interview/InterviewQuestionDetails",
})

export const AnsweredWithFollowUp = meta.story({
  args: { details: response.questionDetails },
  play: async ({ canvas }) => {
    const detail = response.questionDetails[1]!
    await userEvent.click(
      canvas.getByRole("button", {
        name: new RegExp(detail.prompt.slice(0, 16)),
      }),
    )
    await expect(canvas.getByText(detail.followUps[0]!.prompt)).toBeVisible()
  },
})

export const Unanswered = meta.story({
  args: {
    details: [
      {
        ...response.questionDetails[0]!,
        answer: null,
        performance: null,
        followUps: [],
      },
    ],
  },
})
