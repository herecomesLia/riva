import preview from "#storybook/preview"

import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"

import { PracticeQuestionReview } from "./PracticeQuestionReview"

const complete = createPracticeScenario("reviewBalanced")
const ended = createPracticeScenario("reviewFollowUpEndedEarly")
if (complete.session.status !== "review" || ended.session.status !== "review") {
  throw new Error("Review fixtures required.")
}

const meta = preview.meta({
  component: PracticeQuestionReview,
  title: "Practice/PracticeQuestionReview",
})

export const Complete = meta.story({
  args: {
    question: complete.session.question,
    followUps: complete.session.followUps,
  },
})

export const EndedEarly = meta.story({
  args: {
    question: ended.session.question,
    followUps: ended.session.followUps,
  },
})

export const MainQuestionOnly = meta.story({
  args: {
    question: complete.session.question,
    followUps: [],
  },
})
