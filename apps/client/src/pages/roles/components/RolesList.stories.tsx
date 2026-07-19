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
const currentRole = multipleRolesResponse.roles.find((role) => role.isCurrent)!
const selectedRole = multipleRolesResponse.roles.find((role) => !role.isCurrent)!

export const SingleRole = meta.story({
  args: {
    onSelectRole: fn(),
    roles: singleRoleResponse.roles,
    selectedRoleId: singleRoleResponse.currentRoleId,
  },
})

export const MultipleRoles = meta.story({
  args: {
    onSelectRole: fn(),
    roles: multipleRolesResponse.roles,
    selectedRoleId: currentRole.id,
  },
})

const onSelectRole = fn()

export const SelectedRoleDifferentFromCurrent = meta.story({
  args: {
    onSelectRole,
    roles: multipleRolesResponse.roles,
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

export const ArchivedRole = meta.story({
  args: {
    onSelectRole: fn(),
    roles: createRoleStoryResponse("archivedRoles").roles,
    selectedRoleId: "role_frontend_meituan",
  },
})

export const ManyRoles = meta.story({
  args: {
    onSelectRole: fn(),
    roles: createManyRolesResponse().roles,
    selectedRoleId: currentRole.id,
  },
})
