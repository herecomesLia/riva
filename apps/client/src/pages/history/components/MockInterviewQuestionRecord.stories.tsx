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
  title: "History/MockInterviewQuestionRecord",
})

const interviewSearch = {
  targetRoleId: completeMockInterviewHistoryStoryFixture.targetRole.id,
  round: completeMockInterviewHistoryStoryFixture.setup.round,
  difficulty: completeMockInterviewHistoryStoryFixture.setup.difficulty,
  durationMinutes: completeMockInterviewHistoryStoryFixture.setup.plannedDurationMinutes,
} as const

export const AnsweredWithGeneratingFollowUpReference = meta.story({
  args: {
    interviewSearch,
    question: completeMockInterviewHistoryStoryFixture.questions[1],
  },
})

export const Unanswered = meta.story({
  args: {
    interviewSearch,
    question: partialMockInterviewHistoryStoryFixture.questions[1],
  },
})
