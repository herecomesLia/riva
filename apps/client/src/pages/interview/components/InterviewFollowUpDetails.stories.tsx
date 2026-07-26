import preview from "#storybook/preview"
import { expect, userEvent } from "storybook/test"

import { createInterviewReviewResponseMock } from "@/mocks/data/interview"

import { InterviewFollowUpDetails } from "./InterviewFollowUpDetails"

const response = createInterviewReviewResponseMock()
if (response.status !== "complete") throw new Error("Complete review fixture required.")
const followUps = response.questionDetails[1]!.followUps

const meta = preview.meta({
  component: InterviewFollowUpDetails,
  title: "Interview/InterviewFollowUpDetails",
})

export const Answered = meta.story({
  args: { followUps },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: new RegExp(followUps[0]!.record.question.prompt.slice(0, 16)),
      }),
    )
    await expect(canvas.getByText(followUps[0]!.record.answer!.content)).toBeVisible()
  },
})
