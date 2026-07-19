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
    | "qualificationRequirements"
    | "requiredSkills"
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
    role: createRoleStoryResponse("roleWithParsedJobDescription").roles[0]!,
  }
}

export const EditQualifications = meta.story({
  args: dialogArgs("qualificationRequirements"),
  play: async () => {
    const dialog = await screen.findByRole("dialog")
    await expect(within(dialog).getByRole("textbox")).toBeVisible()
  },
})

export const EditRequiredSkills = meta.story({ args: dialogArgs("requiredSkills") })

export const EditPreferredQualifications = meta.story({
  args: dialogArgs("preferredQualifications"),
})

export const EditBusinessDomains = meta.story({ args: dialogArgs("businessDomains") })

export const ValidationError = meta.story({
  args: dialogArgs("responsibilities"),
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    const textarea = within(dialog).getByRole("textbox")
    await userEvent.clear(textarea)
    await userEvent.click(within(dialog).getByRole("button", { name: /保存修改|save changes/i }))
  },
})

export const Pending = meta.story({
  args: {
    ...dialogArgs("responsibilities"),
    onSave: fn(() => new Promise<void>(() => undefined)),
  },
})

export const SaveError = meta.story({
  args: {
    ...dialogArgs("preferredQualifications"),
    onSave: fn(async () => {
      throw new Error("request failed")
    }),
  },
})
