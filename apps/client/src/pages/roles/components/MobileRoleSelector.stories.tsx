import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen } from "storybook/test"

import { createManyRolesResponse, createRoleStoryResponse } from "../stories/role-story-fixtures"
import { MobileRoleSelector } from "./MobileRoleSelector"
import type { RoleListCategory } from "./roles-list-utils"

const meta = preview.meta({
  component: MobileRoleSelector,
  title: "Roles/MobileRoleSelector",
})

function SelectorHarness({
  activeRoleId,
  roles,
  selectedRoleId,
}: {
  activeRoleId: string | null
  roles: ReturnType<typeof createRoleStoryResponse>["roles"]
  selectedRoleId: string
}) {
  const [selectedId, setSelectedId] = useState(selectedRoleId)
  const initialRole = roles.find((role) => role.id === selectedId) ?? roles[0]!
  const [category, setCategory] = useState<RoleListCategory>(
    initialRole.isArchived ? "archived" : "active",
  )
  const selectedRole =
    roles.find(
      (role) =>
        role.id === selectedId && (category === "archived" ? role.isArchived : !role.isArchived),
    ) ?? null
  return (
    <MobileRoleSelector
      category={category}
      activeRoleId={activeRoleId}
      onCategoryChange={(nextCategory) => {
        setCategory(nextCategory)
        setSelectedId(
          roles.find((role) => (nextCategory === "archived" ? role.isArchived : !role.isArchived))
            ?.id ?? "",
        )
      }}
      onSelectRole={setSelectedId}
      roles={roles}
      selectedRole={selectedRole}
    />
  )
}

const multipleRoles = createRoleStoryResponse("multipleRoles")
const currentRole = multipleRoles.roles.find((role) => role.id === multipleRoles.activeRoleId)!
const nonCurrentRole = multipleRoles.roles.find((role) => role.id !== multipleRoles.activeRoleId)!

export const SingleRole = meta.story({
  args: {
    category: "active",
    activeRoleId: createRoleStoryResponse("singleRoleWithoutJobDescription").activeRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: createRoleStoryResponse("singleRoleWithoutJobDescription").roles,
    selectedRole: createRoleStoryResponse("singleRoleWithoutJobDescription").roles[0]!,
  },
})

export const CurrentAndSelectedDifferent = meta.story({
  render: () => (
    <SelectorHarness
      activeRoleId={multipleRoles.activeRoleId}
      roles={multipleRoles.roles}
      selectedRoleId={nonCurrentRole.id}
    />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByTestId("mobile-role-selector-trigger"))
    await expect(
      await screen.findByRole("option", { name: new RegExp(currentRole.title) }),
    ).toHaveTextContent(/当前岗位|current role/i)
    await userEvent.click(screen.getByRole("option", { name: new RegExp(currentRole.title) }))
    await expect(screen.getByTestId("mobile-role-selector-trigger")).toHaveTextContent(
      currentRole.title,
    )
  },
})

export const ArchivedSelected = meta.story({
  render: () => {
    const response = createRoleStoryResponse("archivedRoles")
    const archived = response.roles.find((role) => role.isArchived)!
    return (
      <SelectorHarness
        activeRoleId={response.activeRoleId}
        roles={response.roles}
        selectedRoleId={archived.id}
      />
    )
  },
})

export const ManyRoles = meta.story({
  render: () => {
    const response = createManyRolesResponse()
    return (
      <SelectorHarness
        activeRoleId={response.activeRoleId}
        roles={response.roles}
        selectedRoleId={response.activeRoleId!}
      />
    )
  },
})
