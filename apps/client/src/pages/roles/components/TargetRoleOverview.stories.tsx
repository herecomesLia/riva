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
    setCurrent: fn(),
    togglePreparationStatus: fn(),
    editJobDescriptionAnalysisModule: fn(),
    ...overrides,
  }
}

const meta = preview.meta({
  component: TargetRoleOverview,
  title: "Roles/TargetRoleOverview",
})

const readyRole = createRoleStoryResponse("matchingAnalysisCurrent").roles[0]!
const pausedRole = createRoleStoryResponse("multipleRoles").roles.find(
  (role) => role.preparationStatus === "paused",
)!
const archivedRole = createRoleStoryResponse("archivedRoles").roles.find(
  (role) => role.preparationStatus === "archived",
)!

export const CompleteRole = meta.story({
  args: { actions: createActions(), role: readyRole },
})

export const Paused = meta.story({
  args: { actions: createActions(), role: pausedRole },
})

export const Archived = meta.story({
  args: { actions: createActions(), role: archivedRole },
})

const setCurrent = fn()
const togglePreparationStatus = fn()

export const NonCurrentActions = meta.story({
  args: {
    actions: createActions({ setCurrent, togglePreparationStatus }),
    role: pausedRole,
  },
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /设为当前岗位|set as current role/i }))
    await expect(setCurrent).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole("button", { name: /继续准备|resume preparation/i }))
    await expect(togglePreparationStatus).toHaveBeenCalledTimes(1)
  },
})

export const Pending = meta.story({
  args: { actions: createActions(), pending: true, role: readyRole },
  play: async () => {
    const actions = within(screen.getByTestId("role-actions"))
    for (const button of actions.getAllByRole("button")) {
      await expect(button).toBeDisabled()
    }
  },
})
