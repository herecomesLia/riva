import preview from "#storybook/preview"
import { userEvent } from "storybook/test"
import { practiceFixture } from "@/mocks/fixtures/practice"
import { PracticeFollowUpAssistance } from "./PracticeFollowUpAssistance"

const meta = preview.meta({
  component: PracticeFollowUpAssistance,
  title: "Practice/PracticeFollowUpAssistance",
})
export const Collapsed = meta.story({ args: { question: practiceFixture.followUp.question } })
export const GuidanceExpanded = meta.story({
  args: { question: practiceFixture.followUp.question },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /查看提示|view hints/i }))
    await userEvent.click(
      canvas.getByRole("button", { name: /查看答题框架|view answer framework/i }),
    )
  },
})
