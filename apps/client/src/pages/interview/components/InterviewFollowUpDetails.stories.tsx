import preview from "#storybook/preview"
import { expect, userEvent } from "storybook/test"

import { createInterviewReviewStoryFixture } from "@/pages/interview/stories/interview-story-fixtures"

import { InterviewFollowUpDetails } from "./InterviewFollowUpDetails"

const response = createInterviewReviewStoryFixture()
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
        name: new RegExp(followUps[0]!.prompt.slice(0, 16)),
      }),
    )
    await expect(canvas.getByText(followUps[0]!.answer!)).toBeVisible()
  },
})
