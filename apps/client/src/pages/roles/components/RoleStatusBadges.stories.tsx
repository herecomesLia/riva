import preview from "#storybook/preview"

import { createRoleStoryResponse } from "../stories/role-story-fixtures"
import { RoleStatusBadges } from "./RoleStatusBadges"

const meta = preview.meta({
  component: RoleStatusBadges,
  title: "Roles/RoleStatusBadges",
})

const multipleRoles = createRoleStoryResponse("multipleRoles")

export const CurrentPreparing = meta.story({
  args: { role: multipleRoles.roles.find((role) => role.isCurrent)! },
})

export const Paused = meta.story({
  args: { role: multipleRoles.roles.find((role) => role.preparationStatus === "paused")! },
})

export const Archived = meta.story({
  args: {
    role: createRoleStoryResponse("archivedRoles").roles.find(
      (role) => role.preparationStatus === "archived",
    )!,
  },
})
