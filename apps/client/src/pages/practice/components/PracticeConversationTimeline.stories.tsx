import preview from "#storybook/preview"

import { createPracticeMockResponse } from "@/mocks/data/practice"

import { PracticeConversationTimeline } from "./PracticeConversationTimeline"

const multipleFollowUps = createPracticeMockResponse("answeringFollowUp")
if (multipleFollowUps.session.status !== "answeringFollowUp") {
  throw new Error("The follow-up timeline story requires a follow-up fixture.")
}

const completed = createPracticeMockResponse("evaluatingAnswer")
if (completed.session.status !== "evaluating") {
  throw new Error("The completed timeline story requires an evaluating fixture.")
}

const meta = preview.meta({
  component: PracticeConversationTimeline,
  title: "Practice/Components/ConversationTimeline",
})

export const MultipleFollowUps = meta.story({
  args: {
    currentFollowUp: multipleFollowUps.session.currentFollowUp,
    followUpExchanges: multipleFollowUps.session.followUpExchanges,
    mainAnswer: multipleFollowUps.session.mainAnswer,
    question: multipleFollowUps.session.question,
  },
})

export const Completed = meta.story({
  args: {
    followUpCompletion: completed.session.followUpCompletion,
    followUpExchanges: completed.session.followUpExchanges,
    mainAnswer: completed.session.mainAnswer,
    question: completed.session.question,
  },
})
