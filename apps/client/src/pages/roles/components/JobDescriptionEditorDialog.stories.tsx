import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import { createRoleStoryResponse } from "../stories/role-story-fixtures"
import { JobDescriptionEditorDialog } from "./JobDescriptionEditorDialog"

const meta = preview.meta({
  component: JobDescriptionEditorDialog,
  title: "Roles/JobDescriptionEditorDialog",
})

function DialogHarness({
  role,
}: {
  role: ReturnType<typeof createRoleStoryResponse>["roles"][number]
}) {
  const [open, setOpen] = useState(true)
  return (
    <JobDescriptionEditorDialog
      onDirtyChange={() => undefined}
      onOpenChange={setOpen}
      onSave={async () => undefined}
      onSaved={() => setOpen(false)}
      open={open}
      role={role}
    />
  )
}

export const Add = meta.story({
  render: () => (
    <DialogHarness role={createRoleStoryResponse("singleRoleWithoutJobDescription").roles[0]!} />
  ),
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(
      within(dialog).getByLabelText(/岗位 JD 文本|job description text/i),
      "Lead reliable product delivery.",
    )
    await userEvent.click(
      within(dialog).getByRole("button", { name: /保存并解析|submit and extract/i }),
    )
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAttribute("data-closed"))
  },
})

export const Replace = meta.story({
  render: () => (
    <DialogHarness role={createRoleStoryResponse("roleWithExtractedJobDescription").roles[0]!} />
  ),
})

export const ValidationError = meta.story({
  args: {
    onDirtyChange: fn(),
    onOpenChange: fn(),
    onSave: fn(async () => undefined),
    onSaved: fn(),
    open: true,
    role: createRoleStoryResponse("singleRoleWithoutJobDescription").roles[0]!,
  },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(
      within(dialog).getByRole("button", { name: /保存并解析|submit and extract/i }),
    )
    await expect(
      within(dialog).findByText(/请粘贴岗位 JD 文本|paste the job description/i),
    ).resolves.toBeInTheDocument()
  },
})
