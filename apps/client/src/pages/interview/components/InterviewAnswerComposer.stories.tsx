import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { InterviewAnswerComposer } from "./InterviewAnswerComposer"

const meta = preview.meta({
  component: InterviewAnswerComposer,
  title: "Interview/InterviewAnswerComposer",
})

export const Default = meta.story({
  args: {
    isPending: false,
    onSubmit: fn(async () => undefined),
  },
})

export const Submitting = meta.story({
  args: {
    isPending: true,
    onSubmit: fn(async () => undefined),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox")).toBeDisabled()
    await expect(
      canvas.getByRole("button", { name: /正在提交并准备下一问|submitting and preparing/i }),
    ).toBeDisabled()
  },
})
