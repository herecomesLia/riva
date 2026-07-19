import preview from "#storybook/preview"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import { RoleManagementStoryHarness } from "../stories/RoleManagementStoryHarness"
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

const readyRole = createRoleStoryResponse("roleWithParsedJobDescription").roles[0]!
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
})

const managementInitial = createRoleStoryResponse("multipleRoles")
const nextCurrent = managementInitial.roles.find((role) => !role.isCurrent)!
const currentResult = structuredClone(managementInitial)
currentResult.currentRoleId = nextCurrent.id
currentResult.roles.forEach((role) => {
  role.isCurrent = role.id === nextCurrent.id
})

export const SetCurrent = meta.story({
  render: () => (
    <RoleManagementStoryHarness
      actions={{ setCurrentTargetRole: fn(async () => currentResult) }}
      initialData={managementInitial}
    />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: new RegExp(`^${nextCurrent.title}`) }))
    await userEvent.click(screen.getByRole("button", { name: /设为当前岗位|set as current role/i }))
    await waitFor(() =>
      expect(
        within(screen.getByRole("button", { name: new RegExp(`^${nextCurrent.title}`) })).getByText(
          /当前岗位|current role/i,
        ),
      ).toBeVisible(),
    )
  },
})

const preparationInitial = createRoleStoryResponse("singleRoleWithoutJobDescription")
const pausedResult = structuredClone(preparationInitial)
pausedResult.roles[0]!.preparationStatus = "paused"
pausedResult.roles[0]!.version += 1
const resumedResult = structuredClone(pausedResult)
resumedResult.roles[0]!.preparationStatus = "preparing"
resumedResult.roles[0]!.version += 1
const preparationAction = fn()
  .mockResolvedValueOnce(pausedResult)
  .mockResolvedValueOnce(resumedResult)

export const PauseAndResume = meta.story({
  render: () => (
    <RoleManagementStoryHarness
      actions={{ updateRolePreparationStatus: preparationAction }}
      initialData={preparationInitial}
    />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /暂停准备|pause preparation/i }))
    await waitFor(() => expect(screen.getAllByText(/已暂停|paused/i).length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole("button", { name: /继续准备|resume preparation/i }))
    await waitFor(() => expect(screen.getAllByText(/准备中|preparing/i).length).toBeGreaterThan(0))
  },
})

const archiveInitial = createRoleStoryResponse("singleRoleWithoutJobDescription")
const archivedResult = structuredClone(archiveInitial)
archivedResult.roles[0]!.preparationStatus = "archived"
archivedResult.roles[0]!.isCurrent = false
archivedResult.roles[0]!.version += 1
archivedResult.currentRoleId = null

export const ArchiveConfirmation = meta.story({
  render: () => (
    <RoleManagementStoryHarness
      actions={{ archiveTargetRole: fn(async () => archivedResult) }}
      initialData={archiveInitial}
    />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /归档岗位|archive role/i }))
    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /归档岗位|archive role/i }))
    await waitFor(() => expect(screen.getAllByText(/已归档|archived/i).length).toBeGreaterThan(0))
  },
})

const deleteInitial = createRoleStoryResponse("multipleRoles")
const deletedRole = deleteInitial.roles.find((role) => !role.isCurrent)!
const deleteResult = structuredClone(deleteInitial)
deleteResult.roles = deleteResult.roles.filter((role) => role.id !== deletedRole.id)

export const DeleteConfirmation = meta.story({
  render: () => (
    <RoleManagementStoryHarness
      actions={{ deleteTargetRole: fn(async () => deleteResult) }}
      initialData={deleteInitial}
      initialSelectedRoleId={deletedRole.id}
    />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /删除岗位|delete role/i }))
    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /删除岗位|delete role/i }))
    await waitFor(() => expect(screen.queryByText(deletedRole.title)).not.toBeInTheDocument())
  },
})
