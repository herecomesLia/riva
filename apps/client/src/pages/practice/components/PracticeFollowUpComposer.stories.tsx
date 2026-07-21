import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"
import { useState } from "react"

import { PracticeFollowUpComposer } from "./PracticeFollowUpComposer"

const defaultArgs = {
  interactionLocked: false,
  isEndPending: false,
  isPending: false,
  onDraftChange: fn(),
  onEnd: fn(async () => "executed" as const),
  onSubmit: fn(async () => "executed" as const),
}

const meta = preview.meta({
  component: PracticeFollowUpComposer,
  title: "Practice/Components/FollowUpComposer",
})

export const Default = meta.story({ args: defaultArgs })

const submitted = fn(async () => "executed" as const)

export const SubmitFollowUp = meta.story({
  args: { ...defaultArgs, onSubmit: submitted },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox"), "我会前置确认约束并明确验证标准。")
    await userEvent.click(
      canvas.getByRole("button", { name: /提交追问回答|submit follow-up answer/i }),
    )
    await expect(submitted).toHaveBeenCalledWith("我会前置确认约束并明确验证标准。")
    await expect(canvas.getByRole("textbox")).toHaveValue("")
  },
})

const pendingSubmit = fn((_content: string) => new Promise<"executed" | "ignored">(() => undefined))

function PendingFollowUpComposer() {
  const [isPending, setIsPending] = useState(false)

  return (
    <PracticeFollowUpComposer
      {...defaultArgs}
      interactionLocked={isPending}
      isPending={isPending}
      onSubmit={(content) => {
        setIsPending(true)
        return pendingSubmit(content)
      }}
    />
  )
}

export const SubmittingFollowUp = meta.story({
  render: () => <PendingFollowUpComposer />,
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox"), "正在提交的追问回答")
    await userEvent.click(
      canvas.getByRole("button", { name: /提交追问回答|submit follow-up answer/i }),
    )
    await expect(pendingSubmit).toHaveBeenCalledWith("正在提交的追问回答")
    await expect(
      canvas.getByRole("button", { name: /正在提交追问回答|submitting follow-up answer/i }),
    ).toBeDisabled()
  },
})
