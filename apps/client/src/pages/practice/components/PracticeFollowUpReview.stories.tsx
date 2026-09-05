import preview from "#storybook/preview"
import { expect } from "storybook/test"

import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"

import { PracticeFollowUpReview } from "./PracticeFollowUpReview"

const complete = createPracticeScenario("reviewBalanced")
const ended = createPracticeScenario("reviewFollowUpEndedEarly")
if (complete.session.status !== "review" || ended.session.status !== "review") {
  throw new Error("Review fixtures required.")
}

const meta = preview.meta({
  component: PracticeFollowUpReview,
  title: "Practice/PracticeFollowUpReview",
})

export const FollowUpReviewReadOnly = meta.story({
  args: {
    exchanges: complete.session.followUps,
    completion: complete.session.followUpCompletion,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByRole("button", { name: /展开 RIVA|expand RIVA/i }),
    ).not.toHaveLength(0)
  },
})

export const FollowUpUnansweredReview = meta.story({
  args: {
    exchanges: ended.session.followUps,
    completion: ended.session.followUpCompletion,
  },
  play: async ({ canvas, userEvent }) => {
    const buttons = canvas.getAllByRole("button", { name: /展开 RIVA|expand RIVA/i })
    await userEvent.click(buttons.at(-1)!)
    await expect(canvas.getByText(/未回答|Unanswered/i)).toBeVisible()
  },
})
