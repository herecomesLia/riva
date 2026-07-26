import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"

import { PracticeEvaluationStatus } from "./PracticeEvaluationStatus"

const meta = preview.meta({
  component: PracticeEvaluationStatus,
  title: "Practice/PracticeEvaluation",
})

export const Evaluating = meta.story({
  args: { error: false, isRetrying: false, onRetry: fn() },
})

const retryEvaluation = fn()

export const RetryAfterError = meta.story({
  args: { error: true, isRetrying: false, onRetry: retryEvaluation },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /重新评分|retry evaluation/i }))
    await expect(retryEvaluation).toHaveBeenCalledTimes(1)
  },
})
