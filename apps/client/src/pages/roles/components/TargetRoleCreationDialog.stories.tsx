import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import type { RecognizeRoleInput } from "@/models/target-role-workflow"

import { TargetRoleCreationDialog } from "./TargetRoleCreationDialog"

const meta = preview.meta({
  component: TargetRoleCreationDialog,
  title: "Roles/TargetRoleCreationDialog",
})

function recognize(input: RecognizeRoleInput) {
  void input
  return Promise.resolve()
}

function DialogHarness() {
  const [open, setOpen] = useState(true)
  return (
    <TargetRoleCreationDialog
      onDirtyChange={() => undefined}
      onManualCreate={async () => setOpen(false)}
      onOpenChange={setOpen}
      onRecognize={recognize}
      onSaved={() => setOpen(false)}
      open={open}
    />
  )
}

export const MethodSelection = meta.story({ render: () => <DialogHarness /> })

export const Manual = meta.story({
  render: () => <DialogHarness />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /手动填写|enter manually/i }))
    const manualDialog = await screen.findByRole("dialog", {
      name: /手动填写目标岗位|enter target role manually/i,
    })
    await waitFor(() => expect(manualDialog).toBeVisible())
  },
})

export const PasteAndRecognize = meta.story({
  render: () => <DialogHarness />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /粘贴文字|paste text/i }))
    const entryDialog = await screen.findByRole("dialog", {
      name: /粘贴岗位文字|paste job posting text/i,
    })
    await userEvent.type(
      within(entryDialog).getByLabelText(/岗位信息原文|job posting text/i),
      "Frontend Engineer\nCompany: Riva",
    )
    await userEvent.click(
      within(entryDialog).getByRole("button", { name: /让 Riva 识别|recognize with riva/i }),
    )
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAttribute("data-closed"))
  },
})

export const ImageAgent = meta.story({
  args: {
    onDirtyChange: fn(),
    onManualCreate: fn(async () => undefined),
    onOpenChange: fn(),
    onRecognize: fn(recognize),
    onSaved: fn(),
    open: true,
  },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /上传图片|upload images/i }))
    const entryDialog = await screen.findByRole("dialog", {
      name: /上传岗位图片|upload job posting images/i,
    })
    await waitFor(() =>
      expect(within(entryDialog).getByText(/视觉 Agent|vision agent/i)).toBeVisible(),
    )
  },
})

export const JobLink = meta.story({
  render: () => <DialogHarness />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /岗位链接|job link/i }))
    const entryDialog = await screen.findByRole("dialog", {
      name: /添加岗位链接|add a job posting link/i,
    })
    await userEvent.type(
      within(entryDialog).getByLabelText(/岗位网页链接|job posting url/i),
      "https://jobs.example.com/frontend-engineer",
    )
    await userEvent.click(
      within(entryDialog).getByRole("button", { name: /让 Riva 识别|recognize with riva/i }),
    )
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAttribute("data-closed"))
  },
})
