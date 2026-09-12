import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen } from "storybook/test"

import { createManyRolesResponse, createRoleStoryResponse } from "../stories/role-story-fixtures"
import { MobileTargetRoleSelector } from "./MobileTargetRoleSelector"
import type { TargetRoleListCategory } from "./roles-list-utils"

const meta = preview.meta({
  component: MobileTargetRoleSelector,
  title: "Roles/MobileTargetRoleSelector",
})

function SelectorHarness({
  activeRoleId,
  roles,
  selectedRoleId,
}: {
  activeRoleId: string | null
  roles: ReturnType<typeof createRoleStoryResponse>["targetRoles"]
  selectedRoleId: string
}) {
  const [selectedId, setSelectedId] = useState(selectedRoleId)
  const initialRole = roles.find((role) => role.id === selectedId) ?? roles[0]!
  const [category, setCategory] = useState<TargetRoleListCategory>(
    initialRole.isArchived ? "archived" : "active",
  )
  const selectedRole =
    roles.find(
      (role) =>
        role.id === selectedId && (category === "archived" ? role.isArchived : !role.isArchived),
    ) ?? null
  return (
    <MobileTargetRoleSelector
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
const currentRole = multipleRoles.targetRoles.find(
  (role) => role.id === multipleRoles.activeTargetRoleId,
)!
const nonCurrentRole = multipleRoles.targetRoles.find(
  (role) => role.id !== multipleRoles.activeTargetRoleId,
)!

export const SingleRole = meta.story({
  args: {
    category: "active",
    activeRoleId: createRoleStoryResponse("singleRoleWithoutJobDescription").activeTargetRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: createRoleStoryResponse("singleRoleWithoutJobDescription").targetRoles,
    selectedRole: createRoleStoryResponse("singleRoleWithoutJobDescription").targetRoles[0]!,
  },
})

export const CurrentAndSelectedDifferent = meta.story({
  render: () => (
    <SelectorHarness
      activeRoleId={multipleRoles.activeTargetRoleId}
      roles={multipleRoles.targetRoles}
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
    const archived = response.targetRoles.find((role) => role.isArchived)!
    return (
      <SelectorHarness
        activeRoleId={response.activeTargetRoleId}
        roles={response.targetRoles}
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
        activeRoleId={response.activeTargetRoleId}
        roles={response.targetRoles}
        selectedRoleId={response.activeTargetRoleId!}
      />
    )
  },
})
