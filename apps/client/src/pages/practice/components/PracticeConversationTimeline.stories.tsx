import preview from "#storybook/preview"

import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"

import { PracticeConversationTimeline } from "./PracticeConversationTimeline"

const multipleFollowUps = createPracticeScenario("answeringFollowUp")
if (multipleFollowUps.session.status !== "answeringFollowUp") {
  throw new Error("The follow-up timeline story requires a follow-up fixture.")
}

const completed = createPracticeScenario("processingAnswer")
if (completed.session.status !== "processing") {
  throw new Error("The completed timeline story requires an processing fixture.")
}

const endedEarly = createPracticeScenario("processingFollowUpEndedEarly")
if (endedEarly.session.status !== "processing") {
  throw new Error("The ended-early timeline story requires an processing fixture.")
}

const meta = preview.meta({
  component: PracticeConversationTimeline,
  title: "Practice/PracticeConversationTimeline",
})

export const MultipleFollowUps = meta.story({
  args: {
    currentFollowUp: multipleFollowUps.session.currentFollowUp,
    followUps: multipleFollowUps.session.followUps,
    mainAnswer: multipleFollowUps.session.mainAnswer,
    question: multipleFollowUps.session.question,
  },
})

export const Completed = meta.story({
  args: {
    followUps: completed.session.followUps,
    mainAnswer: completed.session.mainAnswer,
    question: completed.session.question,
  },
})

export const FollowUpEndedEarly = meta.story({
  args: {
    followUps: endedEarly.session.followUps,
    mainAnswer: endedEarly.session.mainAnswer,
    question: endedEarly.session.question,
  },
})
