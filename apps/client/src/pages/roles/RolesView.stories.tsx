import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { createRolesMockResponse } from "@/mocks/data/roles"

import { withRouter } from "#storybook/decorators/with-router"
import { RolesView } from "./RolesView"

const meta = preview.meta({
  component: RolesView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/roles"] } },
  title: "Pages/Roles",
})

export const Loading = meta.story({
  args: { content: { status: "loading" }, variant: "default" },
})

const onRetry = fn()

export const Error = meta.story({
  args: { onRetry, variant: "error" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /重新加载|reload/i }))
    await expect(onRetry).toHaveBeenCalledTimes(1)
  },
})

export const NoRoles = meta.story({
  args: {
    content: { status: "ready", data: createRolesMockResponse("noRoles") },
    variant: "default",
  },
})

export const SingleRole = meta.story({
  args: {
    content: {
      status: "ready",
      data: createRolesMockResponse("singleRoleWithoutJobDescription"),
    },
    variant: "default",
  },
})

export const MultipleRoles = meta.story({
  args: {
    content: { status: "ready", data: createRolesMockResponse("multipleRoles") },
    variant: "default",
  },
})

const noCurrentRoleResponse = createRolesMockResponse("multipleRoles")
noCurrentRoleResponse.currentRoleId = null
noCurrentRoleResponse.roles.forEach((role) => {
  role.isCurrent = false
})

export const NoCurrentRole = meta.story({
  args: {
    content: { status: "ready", data: noCurrentRoleResponse },
    variant: "default",
  },
})

const archivedRolesResponse = createRolesMockResponse("archivedRoles")
const archivedRole = archivedRolesResponse.roles.find(
  (role) => role.preparationStatus === "archived",
)!

export const ArchivedRoleSelected = meta.story({
  args: {
    content: { status: "ready", data: archivedRolesResponse },
    initialSelectedRoleId: archivedRole.id,
    variant: "default",
  },
})
