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
  currentRoleId,
  roles,
  selectedRoleId,
}: {
  currentRoleId: string | null
  roles: ReturnType<typeof createRoleStoryResponse>["roles"]
  selectedRoleId: string
}) {
  const [selectedId, setSelectedId] = useState(selectedRoleId)
  const initialRole = roles.find((role) => role.id === selectedId) ?? roles[0]!
  const [category, setCategory] = useState<TargetRoleListCategory>(
    initialRole.status === "archived" ? "archived" : "active",
  )
  const selectedRole =
    roles.find(
      (role) =>
        role.id === selectedId &&
        (category === "archived" ? role.status === "archived" : role.status !== "archived"),
    ) ?? null
  return (
    <MobileTargetRoleSelector
      category={category}
      currentRoleId={currentRoleId}
      onCategoryChange={(nextCategory) => {
        setCategory(nextCategory)
        setSelectedId(
          roles.find((role) =>
            nextCategory === "archived" ? role.status === "archived" : role.status !== "archived",
          )?.id ?? "",
        )
      }}
      onSelectRole={setSelectedId}
      roles={roles}
      selectedRole={selectedRole}
    />
  )
}

const multipleRoles = createRoleStoryResponse("multipleRoles")
const currentRole = multipleRoles.roles.find((role) => role.id === multipleRoles.currentRoleId)!
const nonCurrentRole = multipleRoles.roles.find((role) => role.id !== multipleRoles.currentRoleId)!

export const SingleRole = meta.story({
  args: {
    category: "active",
    currentRoleId: createRoleStoryResponse("singleRoleWithoutJobDescription").currentRoleId,
    onCategoryChange: fn(),
    onSelectRole: fn(),
    roles: createRoleStoryResponse("singleRoleWithoutJobDescription").roles,
    selectedRole: createRoleStoryResponse("singleRoleWithoutJobDescription").roles[0]!,
  },
})

export const CurrentAndSelectedDifferent = meta.story({
  render: () => (
    <SelectorHarness
      currentRoleId={multipleRoles.currentRoleId}
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
    const archived = response.roles.find((role) => role.status === "archived")!
    return (
      <SelectorHarness
        currentRoleId={response.currentRoleId}
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
        currentRoleId={response.currentRoleId}
        roles={response.roles}
        selectedRoleId={response.currentRoleId!}
      />
    )
  },
})
