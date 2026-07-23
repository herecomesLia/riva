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

export const Saved = meta.story({
  args: { ...defaultArgs, isSaved: true },
  play: async ({ canvas }) => {
    await expect(
      canvas
        .getByRole("button", { name: /取消收藏|remove from saved/i })
        .querySelector(".lucide-bookmark"),
    ).toHaveClass("fill-destructive", "text-destructive")
  },
})

export const MarkedWeak = meta.story({
  args: { ...defaultArgs, isMarkedWeak: true },
  play: async ({ canvas }) => {
    await expect(
      canvas
        .getByRole("button", { name: /取消薄弱标记|remove weak mark/i })
        .querySelector(".lucide-brain"),
    ).toHaveClass("text-amber-500")
  },
})

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
