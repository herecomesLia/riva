import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import type { TrainingRecordReferenceAnswer } from "@/models/training-records"

import { completedTargetedPracticeHistoryStoryFixture } from "../stories/targeted-practice-history-story-fixtures"
import { HistoryReferenceAnswer } from "./HistoryReferenceAnswer"

const ready = completedTargetedPracticeHistoryStoryFixture.questions[1].referenceAnswer

const meta = preview.meta({
  component: HistoryReferenceAnswer,
  title: "History/HistoryReferenceAnswer",
})

export const Ready = meta.story({
  args: { onGenerate: fn(), referenceAnswer: ready },
})
export const Generating = meta.story({
  args: {
    onGenerate: fn(),
    referenceAnswer: { status: "generating", content: null },
  },
})
export const PollingAfterSingleFailure = meta.story({
  args: {
    onGenerate: fn(),
    referenceAnswer: { status: "pollingRetrying", content: null },
  },
})
export const PollingEventuallySucceeded = meta.story({
  args: { onGenerate: fn(), referenceAnswer: ready },
})
export const PollingRetryLimitReached = meta.story({
  args: {
    onGenerate: fn(),
    referenceAnswer: {
      status: "pollingFailed",
      content: null,
      reason: "consecutiveFailures",
    },
  },
})
export const GenerationFailed = meta.story({
  args: {
    onGenerate: fn(),
    referenceAnswer: {
      status: "unavailable",
      content: null,
      reason: "generationFailed",
    },
  },
})
export const InsufficientContext = meta.story({
  args: {
    onGenerate: fn(),
    referenceAnswer: {
      status: "unavailable",
      content: null,
      reason: "insufficientContext",
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: /生成参考答案|generate reference answer/i }),
    ).not.toBeInTheDocument()
  },
})
export const NotRequested = meta.story({
  args: {
    onGenerate: fn(),
    referenceAnswer: {
      status: "notRequested",
      content: null,
    } satisfies TrainingRecordReferenceAnswer,
  },
})

const lockedGenerate = fn()
export const DuplicateClickLocked = meta.story({
  args: {
    onGenerate: lockedGenerate,
    referenceAnswer: { status: "generating", content: null },
  },
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: /生成参考答案|generate reference answer/i })
    await expect(button).toBeDisabled()
    await expect(lockedGenerate).not.toHaveBeenCalled()
  },
})
