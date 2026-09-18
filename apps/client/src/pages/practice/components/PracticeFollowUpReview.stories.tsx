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
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByRole("heading", { name: /RIVA 参考答案|RIVA reference answer/i }),
    ).not.toHaveLength(0)
  },
})

export const FollowUpEndedEarlyReview = meta.story({
  args: {
    exchanges: ended.session.followUps,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/未回答|Unanswered/i)).not.toBeInTheDocument()
  },
})
