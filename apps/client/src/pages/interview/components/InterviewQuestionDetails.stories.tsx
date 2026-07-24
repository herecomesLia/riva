import preview from "#storybook/preview"
import { expect, userEvent } from "storybook/test"

import { createInterviewReviewResponseMock } from "@/mocks/data/interview"

import { InterviewQuestionDetails } from "./InterviewQuestionDetails"

const response = createInterviewReviewResponseMock()
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
        name: new RegExp(detail.record.question.prompt.slice(0, 16)),
      }),
    )
    await expect(canvas.getByText(detail.followUps[0]!.record.question.prompt)).toBeVisible()
  },
})

export const Unanswered = meta.story({
  args: {
    details: [
      {
        ...response.questionDetails[0]!,
        record: {
          status: "unanswered",
          question: response.questionDetails[0]!.record.question,
          answer: null,
          followUps: [],
        },
        performance: null,
        followUps: [],
      },
    ],
  },
})
