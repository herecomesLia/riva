import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"

import { PracticeTaskFailure } from "./PracticeTaskFailure"

const meta = preview.meta({
  component: PracticeTaskFailure,
  title: "Practice/PracticeTaskFailure",
})

const retryTask = fn()

export const RetryAfterFailure = meta.story({
  args: { isRetrying: false, onRetry: retryTask },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /重新尝试|try again/i }))
    await expect(retryTask).toHaveBeenCalledTimes(1)
  },
})

export const Retrying = meta.story({
  args: { isRetrying: true, onRetry: fn() },
})
