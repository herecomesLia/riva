import preview from "#storybook/preview"

import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"
import { PracticeReviewWorkspace } from "./PracticeReviewWorkspace"

const complete = createPracticeScenario("reviewBalanced").session
const ended = createPracticeScenario("reviewFollowUpEndedEarly").session
if (complete.status !== "review" || ended.status !== "review") {
  throw new Error("Review fixtures required.")
}

const meta = preview.meta({
  component: PracticeReviewWorkspace,
  title: "Practice/PracticeReviewWorkspace",
})

export const Complete = meta.story({ args: complete })
export const EndedEarly = meta.story({ args: ended })
export const MainQuestionOnly = meta.story({ args: { ...complete, followUps: [] } })
export const ManyQuestions = meta.story({
  args: {
    ...complete,
    followUps: Array.from({ length: 4 }, () => structuredClone(complete.followUps)).flat(),
  },
})
export const English = meta.story({ args: complete, globals: { locale: "en" } })
