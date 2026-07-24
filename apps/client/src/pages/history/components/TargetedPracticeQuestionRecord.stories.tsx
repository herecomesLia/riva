import preview from "#storybook/preview"

import { withRouter } from "#storybook/decorators/with-router"

import {
  completedTargetedPracticeHistoryStoryFixture,
  partialTargetedPracticeHistoryStoryFixture,
} from "../stories/targeted-practice-history-story-fixtures"
import { TargetedPracticeQuestionRecord } from "./TargetedPracticeQuestionRecord"

const meta = preview.meta({
  component: TargetedPracticeQuestionRecord,
  decorators: [withRouter],
  title: "History/TargetedPracticeQuestionRecord",
})

const practiceSearch = {
  targetRoleId: completedTargetedPracticeHistoryStoryFixture.targetRole.id,
  questionType: "behavioral",
  difficulty: "pressure",
  source: "history",
} as const

export const RetriedWithFollowUp = meta.story({
  args: {
    practiceSearch,
    question: completedTargetedPracticeHistoryStoryFixture.questions[1],
  },
})

export const PartialWithUnansweredFollowUp = meta.story({
  args: {
    practiceSearch,
    question: partialTargetedPracticeHistoryStoryFixture.questions[0],
  },
})
