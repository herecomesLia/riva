import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen, within } from "storybook/test"

import { createRoleStoryResponse } from "../stories/role-story-fixtures"
import { RoleEditorDialog } from "./RoleEditorDialog"

const meta = preview.meta({
  component: RoleEditorDialog,
  title: "Roles/RoleEditorDialog",
})

const role = createRoleStoryResponse("singleRoleWithoutJobDescription").roles[0]!

function DialogHarness({ mode }: { mode: "create" | "edit" }) {
  const [open, setOpen] = useState(true)
  return (
    <RoleEditorDialog
      mode={mode}
      onCreate={async () => undefined}
      onDirtyChange={() => undefined}
      onOpenChange={setOpen}
      onSaved={() => setOpen(false)}
      onUpdate={async () => undefined}
      open={open}
      role={mode === "edit" ? role : null}
    />
  )
}

export const Create = meta.story({
  render: () => <DialogHarness mode="create" />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByLabelText(/岗位名称|role title/i), "Platform Engineer")
    await userEvent.click(within(dialog).getByRole("button", { name: /^保存$|^save$/i }))
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  },
})

export const Edit = meta.story({
  render: () => <DialogHarness mode="edit" />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    const title = within(dialog).getByLabelText(/岗位名称|role title/i)
    await userEvent.clear(title)
    await userEvent.type(title, "Principal Frontend Engineer")
    await userEvent.click(within(dialog).getByRole("button", { name: /^保存$|^save$/i }))
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  },
})

export const ValidationError = meta.story({
  args: {
    mode: "create",
    onCreate: fn(async () => undefined),
    onDirtyChange: fn(),
    onOpenChange: fn(),
    onSaved: fn(),
    onUpdate: fn(async () => undefined),
    open: true,
    role: null,
  },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /^保存$|^save$/i }))
    await expect(
      within(dialog).findByText(/请填写岗位名称|enter a role title/i),
    ).resolves.toBeVisible()
  },
})

export const ExperienceRangeError = meta.story({
  args: {
    mode: "create",
    onCreate: fn(async () => undefined),
    onDirtyChange: fn(),
    onOpenChange: fn(),
    onSaved: fn(),
    onUpdate: fn(async () => undefined),
    open: true,
    role: null,
  },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByLabelText(/岗位名称|role title/i), "Platform Engineer")
    await userEvent.type(within(dialog).getByLabelText(/最低经验|minimum/i), "5")
    await userEvent.type(within(dialog).getByLabelText(/最高经验|maximum/i), "3")
    await userEvent.click(within(dialog).getByRole("button", { name: /^保存$|^save$/i }))
    await expect(
      within(dialog).findByText(
        /最低经验年限不能大于最高经验年限|minimum experience cannot exceed/i,
      ),
    ).resolves.toBeVisible()
  },
})

export const SaveError = meta.story({
  args: {
    mode: "edit",
    onCreate: fn(async () => undefined),
    onDirtyChange: fn(),
    onOpenChange: fn(),
    onSaved: fn(),
    onUpdate: fn(async () => {
      throw new Error("transport detail")
    }),
    open: true,
    role,
  },
})
