import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"
import { useState } from "react"

import { PracticeAnswerComposer } from "./PracticeAnswerComposer"

const meta = preview.meta({
  component: PracticeAnswerComposer,
  title: "Practice/Components/AnswerComposer",
})

const defaultArgs = {
  isPending: false,
  onDraftChange: fn(),
  onSubmit: fn(async () => undefined),
}

export const Default = meta.story({ args: defaultArgs })

const pendingSubmit = fn((_content: string) => new Promise<void>(() => undefined))

function PendingComposer() {
  const [pending, setPending] = useState(false)

  return (
    <PracticeAnswerComposer
      isPending={pending}
      onDraftChange={fn()}
      onSubmit={async (content) => {
        setPending(true)
        await pendingSubmit(content)
      }}
    />
  )
}

export const SubmittingAnswer = meta.story({
  render: () => <PendingComposer />,
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox"), "我负责定位并推动优化落地。")
    await userEvent.click(canvas.getByRole("button", { name: /提交回答|submit answer/i }))
    await expect(pendingSubmit).toHaveBeenCalledWith("我负责定位并推动优化落地。")
    await expect(canvas.getByRole("button", { name: /正在提交|submitting/i })).toBeDisabled()
  },
})

const rejectedSubmit = fn(async () => {
  throw new Error("unsafe story error")
})

export const SubmitError = meta.story({
  args: { ...defaultArgs, onSubmit: rejectedSubmit },
  play: async ({ canvas }) => {
    const textbox = canvas.getByRole("textbox")
    await userEvent.type(textbox, "失败后仍需保留的回答")
    await userEvent.click(canvas.getByRole("button", { name: /提交回答|submit answer/i }))
    await expect(rejectedSubmit).toHaveBeenCalled()
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(textbox).toHaveValue("失败后仍需保留的回答")
  },
})

const draftChanged = fn()

export const UnsavedDraft = meta.story({
  args: { ...defaultArgs, onDraftChange: draftChanged },
  play: async ({ canvas }) => {
    const textbox = canvas.getByRole("textbox")
    await userEvent.type(textbox, "尚未提交的草稿")
    await expect(textbox).toHaveValue("尚未提交的草稿")
    await expect(draftChanged).toHaveBeenLastCalledWith(true)
  },
})
