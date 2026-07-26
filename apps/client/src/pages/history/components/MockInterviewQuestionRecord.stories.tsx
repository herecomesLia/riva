import preview from "#storybook/preview"
import { fn } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"

import {
  completeMockInterviewHistoryStoryFixture,
  partialMockInterviewHistoryStoryFixture,
} from "../stories/mock-interview-history-story-fixtures"
import { MockInterviewQuestionRecord } from "./MockInterviewQuestionRecord"

const meta = preview.meta({
  component: MockInterviewQuestionRecord,
  decorators: [withRouter],
  title: "History/MockInterviewQuestionRecord",
})

export const AnsweredWithGeneratingFollowUpReference = meta.story({
  args: {
    isReferenceAnswerRequesting: () => false,
    onGenerateReferenceAnswer: fn(),
    question: completeMockInterviewHistoryStoryFixture.questions[1],
  },
})

export const Unanswered = meta.story({
  args: {
    isReferenceAnswerRequesting: () => false,
    onGenerateReferenceAnswer: fn(),
    question: partialMockInterviewHistoryStoryFixture.questions[1],
  },
})

export const UnansweredFollowUp = meta.story({
  args: {
    isReferenceAnswerRequesting: () => false,
    onGenerateReferenceAnswer: fn(),
    question: partialMockInterviewHistoryStoryFixture.questions[0],
  },
})
