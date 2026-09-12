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
const currentRole = multipleRolesResponse.roles.find(
  (role) => role.id === multipleRolesResponse.activeRoleId,
)!
const selectedRole = multipleRolesResponse.roles.find(
  (role) => role.id !== multipleRolesResponse.activeRoleId,
)!

export const SavedRoles = meta.story({
  args: {
    category: "active",
    activeRoleId: singleRoleResponse.activeRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: singleRoleResponse.roles,
    matchingByRoleId: singleRoleResponse.matchingByRoleId,
    selectedRoleId: singleRoleResponse.activeRoleId,
  },
})

export const MixedRoles = meta.story({
  args: {
    category: "active",
    activeRoleId: multipleRolesResponse.activeRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: multipleRolesResponse.roles,
    matchingByRoleId: multipleRolesResponse.matchingByRoleId,
    selectedRoleId: currentRole.id,
  },
})

const onSelectRole = fn()

export const SelectedRoleDifferentFromCurrent = meta.story({
  args: {
    category: "active",
    activeRoleId: multipleRolesResponse.activeRoleId,
    onCategoryChange: fn(),
    onSelectRole,
    roles: multipleRolesResponse.roles,
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
const archivedRole = archivedRolesResponse.roles.find((role) => role.isArchived)!

export const ArchivedRoles = meta.story({
  args: {
    category: "archived",
    activeRoleId: archivedRolesResponse.activeRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: archivedRolesResponse.roles,
    matchingByRoleId: archivedRolesResponse.matchingByRoleId,
    selectedRoleId: archivedRole.id,
  },
})

export const ScrollableRolesList = meta.story({
  args: {
    category: "active",
    activeRoleId: multipleRolesResponse.activeRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: createManyRolesResponse().roles,
    matchingByRoleId: createManyRolesResponse().matchingByRoleId,
    selectedRoleId: currentRole.id,
  },
})

const scoreResponse = createRoleStoryResponse("matchingAnalysisCurrent")
const roleWithoutScore = createRoleStoryResponse("singleRoleWithoutJobDescription").roles[0]!
roleWithoutScore.id = "role-without-match-score"
roleWithoutScore.title = "Platform Product Manager"

export const RolesWithAndWithoutMatchScore = meta.story({
  args: {
    category: "active",
    activeRoleId: scoreResponse.activeRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: [scoreResponse.roles[0]!, roleWithoutScore],
    matchingByRoleId: scoreResponse.matchingByRoleId,
    selectedRoleId: scoreResponse.roles[0]!.id,
  },
})
