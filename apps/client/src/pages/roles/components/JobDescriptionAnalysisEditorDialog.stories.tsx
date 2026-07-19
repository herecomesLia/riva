import preview from "#storybook/preview"
import { expect, fn, screen, within } from "storybook/test"

import { createRoleStoryResponse } from "../stories/role-story-fixtures"
import { JobDescriptionAnalysisEditorDialog } from "./JobDescriptionAnalysisEditorDialog"

const meta = preview.meta({
  component: JobDescriptionAnalysisEditorDialog,
  title: "Roles/JobDescriptionAnalysisEditorDialog",
})

function dialogArgs(field: "coreRequirementsSummary" | "responsibilities") {
  return {
    field,
    onDirtyChange: fn(),
    onOpenChange: fn(),
    onSave: fn(async () => undefined),
    onSaved: fn(),
    role: createRoleStoryResponse("roleWithParsedJobDescription").roles[0]!,
  }
}

export const EditSummary = meta.story({
  args: dialogArgs("coreRequirementsSummary"),
  play: async () => {
    const dialog = await screen.findByRole("dialog")
    await expect(within(dialog).getByRole("textbox")).toBeVisible()
  },
})

export const EditResponsibilities = meta.story({ args: dialogArgs("responsibilities") })

export const ValidationError = meta.story({
  args: dialogArgs("coreRequirementsSummary"),
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog")
    const textarea = within(dialog).getByRole("textbox")
    await userEvent.clear(textarea)
    await userEvent.click(within(dialog).getByRole("button", { name: /保存修改|save changes/i }))
    await expect(
      within(dialog).findByText(/请填写核心要求总结|core requirements summary/i),
    ).resolves.toBeVisible()
  },
})

export const Pending = meta.story({
  args: {
    ...dialogArgs("responsibilities"),
    onSave: fn(() => new Promise<void>(() => undefined)),
  },
})
