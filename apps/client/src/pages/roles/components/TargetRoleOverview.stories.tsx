import preview from "#storybook/preview"
import { expect, fn, screen, within } from "storybook/test"

import { createRoleStoryResponse } from "../stories/role-story-fixtures"
import type { RoleDetailsActions } from "./RoleDetails"
import { TargetRoleOverview } from "./TargetRoleOverview"

function createActions(overrides: Partial<RoleDetailsActions> = {}): RoleDetailsActions {
  return {
    archive: fn(),
    delete: fn(),
    edit: fn(),
    editJobDescription: fn(),
    generateMatchingAnalysis: fn(),
    retryJobDescriptionParsing: fn(),
    retryJobDescriptionSynchronization: fn(),
    retryMatchingAnalysisSynchronization: fn(),
    restore: fn(),
    setCurrent: fn(),
    editJobDescriptionAnalysisModule: fn(),
    ...overrides,
  }
}

const meta = preview.meta({
  component: TargetRoleOverview,
  title: "Roles/TargetRoleOverview",
})

const readyRole = createRoleStoryResponse("matchingAnalysisCurrent").roles[0]!
const activeRole = createRoleStoryResponse("multipleRoles").roles.find(
  (role) => role.id !== createRoleStoryResponse("multipleRoles").currentRoleId,
)!
const archivedRole = createRoleStoryResponse("archivedRoles").roles.find(
  (role) => role.status === "archived",
)!

export const CompleteRole = meta.story({
  args: { actions: createActions(), isCurrent: true, role: readyRole },
})

export const Active = meta.story({
  args: { actions: createActions(), isCurrent: false, role: activeRole },
})

export const Archived = meta.story({
  args: { actions: createActions(), isCurrent: false, role: archivedRole },
})

const restore = fn()
export const RestoreArchived = meta.story({
  args: { actions: createActions({ restore }), isCurrent: false, role: archivedRole },
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /恢复岗位|restore role/i }))
    await expect(restore).toHaveBeenCalledTimes(1)
  },
})

const setCurrent = fn()
export const NonCurrentActions = meta.story({
  args: {
    actions: createActions({ setCurrent }),
    isCurrent: false,
    role: activeRole,
  },
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /设为当前岗位|set as current role/i }))
    await expect(setCurrent).toHaveBeenCalledTimes(1)
  },
})

export const Pending = meta.story({
  args: { actions: createActions(), isCurrent: true, pending: true, role: readyRole },
  play: async () => {
    const actions = within(screen.getByTestId("role-actions"))
    for (const button of actions.getAllByRole("button")) {
      await expect(button).toBeDisabled()
    }
  },
})
