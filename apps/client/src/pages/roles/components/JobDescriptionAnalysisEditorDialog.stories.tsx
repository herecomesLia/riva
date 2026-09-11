import preview from "#storybook/preview"
import { expect, fn, screen, within } from "storybook/test"

import { createRoleStoryResponse } from "../stories/role-story-fixtures"
import { JobDescriptionAnalysisEditorDialog } from "./JobDescriptionAnalysisEditorDialog"

const meta = preview.meta({
  component: JobDescriptionAnalysisEditorDialog,
  title: "Roles/JobDescriptionAnalysisEditorDialog",
})

function dialogArgs(
  field:
    | "requirements"
    | "hardSkills"
    | "preferredQualifications"
    | "businessDomains"
    | "responsibilities",
) {
  return {
    field,
    onDirtyChange: fn(),
    onOpenChange: fn(),
    onSave: fn(async () => undefined),
    onSaved: fn(),
    role: createRoleStoryResponse("roleWithExtractedJobDescription").roles[0]!,
  }
}

export const EditQualifications = meta.story({
  args: dialogArgs("requirements"),
  play: async () => {
    const dialog = await screen.findByRole("dialog")
    await expect(within(dialog).getAllByRole("textbox")[0]!).toBeInTheDocument()
  },
})

export const EditRequiredSkills = meta.story({ args: dialogArgs("hardSkills") })

export const EditPreferredQualifications = meta.story({
  args: dialogArgs("preferredQualifications"),
})

export const EditBusinessDomains = meta.story({ args: dialogArgs("businessDomains") })

const pendingSave = fn(() => new Promise<void>(() => undefined))

export const Pending = meta.story({
  args: {
    ...dialogArgs("responsibilities"),
    onSave: pendingSave,
  },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /保存修改|save changes/i }))

    await expect(pendingSave).toHaveBeenCalledTimes(1)
    await expect(within(dialog).getByRole("button", { name: /正在保存|saving/i })).toBeDisabled()
    await expect(within(dialog).getByRole("button", { name: /正在保存|saving/i })).toContainElement(
      within(dialog).getByRole("status"),
    )
    await expect(dialog).toBeInTheDocument()
  },
})

const failedSave = fn(async () => {
  throw new Error("request failed")
})

export const SaveError = meta.story({
  args: {
    ...dialogArgs("preferredQualifications"),
    onSave: failedSave,
  },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    const input = within(dialog).getAllByRole("textbox")[0]!
    const retainedValue = "具备复杂平台迁移经验"
    await userEvent.clear(input)
    await userEvent.type(input, retainedValue)
    await userEvent.click(within(dialog).getByRole("button", { name: /保存修改|save changes/i }))

    await expect(failedSave).toHaveBeenCalledTimes(1)
    await expect(
      within(dialog).findByText(/暂时无法保存本次修改|We could not save this change/i),
    ).resolves.toBeInTheDocument()
    await expect(within(dialog).queryByText("request failed")).not.toBeInTheDocument()
    await expect(dialog).toBeInTheDocument()
    await expect(input).toHaveValue(retainedValue)
  },
})
