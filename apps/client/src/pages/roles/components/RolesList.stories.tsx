import preview from "#storybook/preview"
import { expect, fn, screen, within } from "storybook/test"

import { createRoleStoryResponse, createManyRolesResponse } from "../stories/role-story-fixtures"
import { RolesList } from "./RolesList"

const meta = preview.meta({
  component: RolesList,
  title: "Roles/RolesList",
})

const singleRoleResponse = createRoleStoryResponse("singleRoleWithoutJobDescription")
const multipleRolesResponse = createRoleStoryResponse("multipleRoles")
const currentRole = multipleRolesResponse.targetRoles.find(
  (role) => role.id === multipleRolesResponse.activeTargetRoleId,
)!
const selectedRole = multipleRolesResponse.targetRoles.find(
  (role) => role.id !== multipleRolesResponse.activeTargetRoleId,
)!

export const SavedRoles = meta.story({
  args: {
    category: "active",
    activeRoleId: singleRoleResponse.activeTargetRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: singleRoleResponse.targetRoles,
    matchingByRoleId: singleRoleResponse.matchingByRoleId,
    selectedRoleId: singleRoleResponse.activeTargetRoleId,
  },
})

export const MixedRoles = meta.story({
  args: {
    category: "active",
    activeRoleId: multipleRolesResponse.activeTargetRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: multipleRolesResponse.targetRoles,
    matchingByRoleId: multipleRolesResponse.matchingByRoleId,
    selectedRoleId: currentRole.id,
  },
})

const onSelectRole = fn()

export const SelectedRoleDifferentFromCurrent = meta.story({
  args: {
    category: "active",
    activeRoleId: multipleRolesResponse.activeTargetRoleId,
    onCategoryChange: fn(),
    onSelectRole,
    roles: multipleRolesResponse.targetRoles,
    matchingByRoleId: multipleRolesResponse.matchingByRoleId,
    selectedRoleId: selectedRole.id,
  },
  play: async ({ userEvent }) => {
    const currentButton = screen.getByRole("button", { name: new RegExp(`^${currentRole.title}`) })
    const selectedButton = screen.getByRole("button", {
      name: new RegExp(`^${selectedRole.title}`),
    })

    await expect(currentButton).toHaveAttribute("aria-pressed", "false")
    await expect(within(currentButton).getByText(/当前岗位|current role/i)).toBeVisible()
    await expect(selectedButton).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(currentButton)
    await expect(onSelectRole).toHaveBeenCalledWith(currentRole.id)
  },
})

const archivedRolesResponse = createRoleStoryResponse("archivedRoles")
const archivedRole = archivedRolesResponse.targetRoles.find((role) => role.isArchived)!

export const ArchivedRoles = meta.story({
  args: {
    category: "archived",
    activeRoleId: archivedRolesResponse.activeTargetRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: archivedRolesResponse.targetRoles,
    matchingByRoleId: archivedRolesResponse.matchingByRoleId,
    selectedRoleId: archivedRole.id,
  },
})

export const ScrollableRolesList = meta.story({
  args: {
    category: "active",
    activeRoleId: multipleRolesResponse.activeTargetRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: createManyRolesResponse().targetRoles,
    matchingByRoleId: createManyRolesResponse().matchingByRoleId,
    selectedRoleId: currentRole.id,
  },
})

const scoreResponse = createRoleStoryResponse("matchingAnalysisCurrent")
const roleWithoutScore = createRoleStoryResponse("singleRoleWithoutJobDescription").targetRoles[0]!
roleWithoutScore.id = "role-without-match-score"
roleWithoutScore.title = "Platform Product Manager"

export const RolesWithAndWithoutMatchScore = meta.story({
  args: {
    category: "active",
    activeRoleId: scoreResponse.activeTargetRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: [scoreResponse.targetRoles[0]!, roleWithoutScore],
    matchingByRoleId: scoreResponse.matchingByRoleId,
    selectedRoleId: scoreResponse.targetRoles[0]!.id,
  },
})
