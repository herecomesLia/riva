import preview from "#storybook/preview"
import { userEvent } from "storybook/test"
import { practiceFixture } from "@/mocks/fixtures/practice"
import { PracticeQuestionGuidance } from "./PracticeQuestionGuidance"

const meta = preview.meta({
  component: PracticeQuestionGuidance,
  title: "Practice/PracticeQuestionGuidance",
})
export const Collapsed = meta.story({ args: practiceFixture.question.guidance })
export const Expanded = meta.story({
  args: practiceFixture.question.guidance,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /查看提示|view hints/i }))
    await userEvent.click(
      canvas.getByRole("button", { name: /查看答题框架|view answer framework/i }),
    )
  },
})
export const Empty = meta.story({
  args: { hints: [], framework: [] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /查看提示|view hints/i }))
    await userEvent.click(
      canvas.getByRole("button", { name: /查看答题框架|view answer framework/i }),
    )
  },
})
