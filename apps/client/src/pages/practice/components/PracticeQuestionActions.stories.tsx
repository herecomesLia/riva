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

  isSkipPending: false,

  onSkip: skip,
}

export const Default = meta.story({ args: defaultArgs })

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
