import preview from "#storybook/preview"
import { fn } from "storybook/test"

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

export const RetriedWithFollowUp = meta.story({
  args: {
    isReferenceAnswerRequesting: () => false,
    onGenerateReferenceAnswer: fn(),
    question: completedTargetedPracticeHistoryStoryFixture.questions[1],
  },
})

export const PartialWithUnansweredFollowUp = meta.story({
  args: {
    isReferenceAnswerRequesting: () => false,
    onGenerateReferenceAnswer: fn(),
    question: partialTargetedPracticeHistoryStoryFixture.questions[0],
  },
})

const unansweredMainQuestion = structuredClone(
  partialTargetedPracticeHistoryStoryFixture.questions[0],
)
unansweredMainQuestion.answer = null
unansweredMainQuestion.evaluation = null
unansweredMainQuestion.review = null
unansweredMainQuestion.referenceAnswer = { status: "notRequested", content: null }

export const UnansweredMainQuestion = meta.story({
  args: {
    isReferenceAnswerRequesting: () => false,
    onGenerateReferenceAnswer: fn(),
    question: unansweredMainQuestion,
  },
})
