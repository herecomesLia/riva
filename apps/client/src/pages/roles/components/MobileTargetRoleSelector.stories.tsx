import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen } from "storybook/test"

import { createManyRolesResponse, createRoleStoryResponse } from "../stories/role-story-fixtures"
import { MobileTargetRoleSelector } from "./MobileTargetRoleSelector"

const meta = preview.meta({
  component: MobileTargetRoleSelector,
  title: "Roles/MobileTargetRoleSelector",
})

function SelectorHarness({
  roles,
  selectedRoleId,
}: {
  roles: ReturnType<typeof createRoleStoryResponse>["roles"]
  selectedRoleId: string
}) {
  const [selectedId, setSelectedId] = useState(selectedRoleId)
  const selectedRole = roles.find((role) => role.id === selectedId) ?? roles[0]!
  return (
    <MobileTargetRoleSelector
      onSelectRole={setSelectedId}
      roles={roles}
      selectedRole={selectedRole}
    />
  )
}

const multipleRoles = createRoleStoryResponse("multipleRoles")
const currentRole = multipleRoles.roles.find((role) => role.isCurrent)!
const nonCurrentRole = multipleRoles.roles.find((role) => !role.isCurrent)!

export const SingleRole = meta.story({
  args: {
    onSelectRole: fn(),
    roles: createRoleStoryResponse("singleRoleWithoutJobDescription").roles,
    selectedRole: createRoleStoryResponse("singleRoleWithoutJobDescription").roles[0]!,
  },
})

export const CurrentAndSelectedDifferent = meta.story({
  render: () => <SelectorHarness roles={multipleRoles.roles} selectedRoleId={nonCurrentRole.id} />,
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByTestId("mobile-role-selector-trigger"))
    await userEvent.click(
      await screen.findByRole("option", { name: new RegExp(currentRole.title) }),
    )
    await expect(screen.getByTestId("mobile-role-selector-trigger")).toHaveTextContent(
      currentRole.title,
    )
  },
})

export const ArchivedSelected = meta.story({
  render: () => {
    const response = createRoleStoryResponse("archivedRoles")
    const archived = response.roles.find((role) => role.preparationStatus === "archived")!
    return <SelectorHarness roles={response.roles} selectedRoleId={archived.id} />
  },
})

export const ManyRoles = meta.story({
  render: () => {
    const response = createManyRolesResponse()
    return <SelectorHarness roles={response.roles} selectedRoleId={response.currentRoleId!} />
  },
})
