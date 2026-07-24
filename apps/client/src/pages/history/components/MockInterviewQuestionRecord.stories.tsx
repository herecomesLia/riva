import preview from "#storybook/preview"

import { withRouter } from "#storybook/decorators/with-router"

import {
  completeMockInterviewHistoryStoryFixture,
  partialMockInterviewHistoryStoryFixture,
} from "../stories/mock-interview-history-story-fixtures"
import { MockInterviewQuestionRecord } from "./MockInterviewQuestionRecord"

const meta = preview.meta({
  component: MockInterviewQuestionRecord,
  decorators: [withRouter],
  title: "History/Components/Mock Interview Question Record",
})

export const AnsweredWithGeneratingFollowUpReference = meta.story({
  args: { question: completeMockInterviewHistoryStoryFixture.questions[1] },
})

export const Unanswered = meta.story({
  args: { question: partialMockInterviewHistoryStoryFixture.questions[1] },
})
