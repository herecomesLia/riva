import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { CandidateQuestionComposer } from "./CandidateQuestionComposer"

const meta = preview.meta({
  component: CandidateQuestionComposer,
  title: "Interview/CandidateQuestionComposer",
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
    await expect(canvas.getByRole("button")).toBeDisabled()
  },
})

export const SubmissionFailurePreservesContent = meta.story({
  args: {
    isPending: false,
    onSubmit: fn(async () => {
      throw new Error("submit failed")
    }),
  },
  play: async ({ canvas, userEvent }) => {
    const content = "这个岗位前三个月最重要的目标是什么？"
    await userEvent.type(canvas.getByRole("textbox"), content)
    await userEvent.click(canvas.getByRole("button", { name: /提交问题|submit question/i }))
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(canvas.getByRole("textbox")).toHaveValue(content)
  },
})
