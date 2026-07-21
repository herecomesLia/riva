import preview from "#storybook/preview"
import { expect, fn, screen, userEvent } from "storybook/test"

import { PracticeQuestionActions } from "./PracticeQuestionActions"

const skip = fn(async () => "executed" as const)
const end = fn(async () => "executed" as const)

const meta = preview.meta({
  component: PracticeQuestionActions,
  title: "Practice/PracticeQuestionActions",
})

const defaultArgs = {
  interactionLocked: false,
  isEndPending: false,
  isMarkedWeak: false,
  isSaved: false,
  isSavedPending: false,
  isSkipPending: false,
  isWeakPending: false,
  onEnd: end,
  onSetSaved: fn(async () => "executed" as const),
  onSetWeak: fn(async () => "executed" as const),
  onSkip: skip,
}

export const Default = meta.story({ args: defaultArgs })

export const Confirmations = meta.story({
  args: defaultArgs,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /跳过本题|skip question/i }))
    await expect(skip).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: /确认跳过|skip question/i }))
    await expect(skip).toHaveBeenCalledTimes(1)

    await userEvent.click(
      canvas.getByRole("button", { name: /结束本轮练习|end practice session/i }),
    )
    await expect(end).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: /结束练习|end practice/i }))
    await expect(end).toHaveBeenCalledTimes(1)
  },
})
