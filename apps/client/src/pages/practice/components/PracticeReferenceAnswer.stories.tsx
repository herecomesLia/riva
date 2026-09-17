import preview from "#storybook/preview"
import { screen, userEvent, within } from "storybook/test"
import { practiceFixture } from "@/mocks/fixtures/practice"
import { PracticeReferenceAnswer } from "./PracticeReferenceAnswer"

const meta = preview.meta({
  component: PracticeReferenceAnswer,
  title: "Practice/PracticeReferenceAnswer",
})
const args = { referenceAnswer: practiceFixture.question.referenceAnswer }
export const Collapsed = meta.story({ args })
export const Confirmation = meta.story({
  args,
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /查看参考答案|view reference answer/i }),
    )
  },
})
export const Expanded = meta.story({
  args,
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /查看参考答案|view reference answer/i }),
    )
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /查看参考答案|view reference answer/i,
      }),
    )
  },
})
