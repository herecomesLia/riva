import preview from "#storybook/preview"

import { createRoleStoryResponse } from "../stories/role-story-fixtures"
import { RoleStatusBadges } from "./RoleStatusBadges"

const meta = preview.meta({
  component: RoleStatusBadges,
  title: "Roles/RoleStatusBadges",
})

const multipleRoles = createRoleStoryResponse("multipleRoles")

export const CurrentActive = meta.story({
  args: {
    isCurrent: true,
    role: multipleRoles.roles.find((role) => role.id === multipleRoles.activeRoleId)!,
  },
})

export const Active = meta.story({
  args: {
    isCurrent: false,
    role: multipleRoles.roles.find((role) => role.id !== multipleRoles.activeRoleId)!,
  },
})

export const Archived = meta.story({
  args: {
    isCurrent: false,
    role: createRoleStoryResponse("archivedRoles").roles.find((role) => role.isArchived)!,
  },
})
