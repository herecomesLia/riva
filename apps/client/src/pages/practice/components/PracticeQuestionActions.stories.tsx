import preview from "#storybook/preview"
import { expect, fn, screen, userEvent } from "storybook/test"

import { PracticeQuestionActions } from "./PracticeQuestionActions"

const skip = fn(async () => "executed" as const)

const meta = preview.meta({
  component: PracticeQuestionActions,
  title: "Practice/PracticeQuestionActions",
})

const defaultArgs = {
  interactionLocked: false,
  isWeak: false,
  isSaved: false,
  isSavedPending: false,
  isSkipPending: false,
  isWeakPending: false,
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
  args: { ...defaultArgs, isWeak: true },
  play: async ({ canvas }) => {
    await expect(
      canvas
        .getByRole("button", { name: /取消薄弱标记|remove weak mark/i })
        .querySelector(".lucide-brain"),
    ).toHaveClass("text-amber-500")
  },
})

export const FlagActionsPending = meta.story({
  args: {
    ...defaultArgs,
    interactionLocked: true,
    isSavedPending: true,
    isWeakPending: true,
  },
  play: async ({ canvas }) => {
    for (const name of [/收藏题目|save question/i, /标记为薄弱题|mark as weak/i]) {
      const button = canvas.getByRole("button", { name })
      await expect(button).toBeDisabled()
      await expect(button.querySelector('[data-slot="spinner"]')).toBeVisible()
    }
  },
})

export const CollapsedSidebar = meta.story({
  args: defaultArgs,
  decorators: [
    (Story) => (
      <div className="group/sidebar-wrapper" data-testid="collapsed-sidebar">
        <div data-collapsible="icon">
          <Story />
        </div>
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("collapsed-sidebar")).toContainElement(
      canvas.getByTestId("practice-question-actions-bar"),
    )
    await expect(canvas.getByTestId("practice-question-actions-bar")).toHaveClass(
      "md:group-has-data-[collapsible=icon]/sidebar-wrapper:left-(--sidebar-width-icon)",
    )
  },
})

export const Confirmations = meta.story({
  args: defaultArgs,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /跳过本题|skip question/i }))
    await expect(skip).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: /确认跳过|skip question/i }))
    await expect(skip).toHaveBeenCalledTimes(1)
  },
})
