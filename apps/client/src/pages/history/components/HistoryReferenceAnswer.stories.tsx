import preview from "#storybook/preview"

import { withRouter } from "#storybook/decorators/with-router"

import type { TrainingRecordReferenceAnswer } from "@/models/training-records"

import { completedTargetedPracticeHistoryStoryFixture } from "../stories/targeted-practice-history-story-fixtures"
import { HistoryReferenceAnswer } from "./HistoryReferenceAnswer"

const ready = completedTargetedPracticeHistoryStoryFixture.questions[1].referenceAnswer

const meta = preview.meta({
  component: HistoryReferenceAnswer,
  decorators: [withRouter],
  title: "History/HistoryReferenceAnswer",
})

const practiceGenerateLink = {
  to: "/practice",
  search: { source: "history" },
} as const

export const Ready = meta.story({
  args: { generateLink: practiceGenerateLink, referenceAnswer: ready },
})
export const Generating = meta.story({
  args: {
    generateLink: practiceGenerateLink,
    referenceAnswer: { status: "generating", content: null },
  },
})
export const Unavailable = meta.story({
  args: {
    generateLink: practiceGenerateLink,
    referenceAnswer: {
      status: "unavailable",
      content: null,
      reason: "generationFailed",
    },
  },
})
export const NotRequested = meta.story({
  args: {
    generateLink: practiceGenerateLink,
    referenceAnswer: {
      status: "notRequested",
      content: null,
    } satisfies TrainingRecordReferenceAnswer,
  },
})
