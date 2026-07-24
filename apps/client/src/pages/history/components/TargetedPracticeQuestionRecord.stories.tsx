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
  title: "History/Components/Targeted Practice Question Record",
})

export const RetriedWithFollowUp = meta.story({
  args: { question: completedTargetedPracticeHistoryStoryFixture.questions[1] },
})

export const PartialWithUnansweredFollowUp = meta.story({
  args: { question: partialTargetedPracticeHistoryStoryFixture.questions[0] },
})
