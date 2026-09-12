import preview from "#storybook/preview"
import { expect, fn, screen, within } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import { RolesView } from "./RolesView"
import {
  createLongJobDescriptionResponse,
  createLongMatchingAnalysisResponse,
  createManyRolesResponse,
  createRoleStoryResponse,
} from "./stories/role-story-fixtures"

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
    content: { status: "ready", data: createRoleStoryResponse("noRoles") },
    jdTasksByRoleId: createRoleStoryResponse("noRoles").jdTasksByRoleId,
    matchingByRoleId: createRoleStoryResponse("noRoles").matchingByRoleId,
    variant: "default",
  },
})

export const SingleRole = meta.story({
  args: {
    content: {
      status: "ready",
      data: createRoleStoryResponse("singleRoleWithoutJobDescription"),
    },
    jdTasksByRoleId: createRoleStoryResponse("singleRoleWithoutJobDescription").jdTasksByRoleId,
    matchingByRoleId: createRoleStoryResponse("singleRoleWithoutJobDescription").matchingByRoleId,
    variant: "default",
  },
})

export const MultipleRoles = meta.story({
  args: {
    content: { status: "ready", data: createRoleStoryResponse("multipleRoles") },
    jdTasksByRoleId: createRoleStoryResponse("multipleRoles").jdTasksByRoleId,
    matchingByRoleId: createRoleStoryResponse("multipleRoles").matchingByRoleId,
    variant: "default",
  },
})

export const NoCurrentRole = meta.story({
  args: {
    content: { status: "ready", data: createRoleStoryResponse("rolesWithoutCurrent") },
    jdTasksByRoleId: createRoleStoryResponse("rolesWithoutCurrent").jdTasksByRoleId,
    matchingByRoleId: createRoleStoryResponse("rolesWithoutCurrent").matchingByRoleId,
    variant: "default",
  },
})

const archivedRoles = createRoleStoryResponse("archivedRoles")
const archivedRole = archivedRoles.roles.find((role) => role.isArchived)!

export const ArchivedRoleSelected = meta.story({
  args: {
    content: { status: "ready", data: archivedRoles },
    jdTasksByRoleId: archivedRoles.jdTasksByRoleId,
    matchingByRoleId: archivedRoles.matchingByRoleId,
    initialSelectedRoleId: archivedRole.id,
    variant: "default",
  },
})

const selectedDifferent = createRoleStoryResponse("multipleRoles")
const currentRole = selectedDifferent.roles.find(
  (role) => role.id === selectedDifferent.activeRoleId,
)!
const selectedRole = selectedDifferent.roles.find(
  (role) => role.id !== selectedDifferent.activeRoleId,
)!

export const SelectedRoleDifferentFromCurrent = meta.story({
  args: {
    content: { status: "ready", data: selectedDifferent },
    jdTasksByRoleId: selectedDifferent.jdTasksByRoleId,
    matchingByRoleId: selectedDifferent.matchingByRoleId,
    initialSelectedRoleId: selectedRole.id,
    variant: "default",
  },
  play: async ({ userEvent }) => {
    const currentButton = screen.getByRole("button", { name: new RegExp(`^${currentRole.title}`) })
    await expect(within(currentButton).getByText(/当前岗位|current role/i)).toBeVisible()
    await expect(screen.getByRole("heading", { name: selectedRole.title })).toBeVisible()

    await userEvent.click(screen.getByRole("tab", { name: /岗位 JD|job description/i }))
    await expect(screen.getByTestId("job-description-card")).toBeVisible()
    await userEvent.click(currentButton)
    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${selectedRole.title}`) }),
    )

    await expect(screen.getByRole("tab", { name: /岗位 JD|job description/i })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await expect(within(currentButton).getByText(/当前岗位|current role/i)).toBeVisible()
  },
})

export const ManyRoles = meta.story({
  args: {
    content: { status: "ready", data: createManyRolesResponse() },
    jdTasksByRoleId: createManyRolesResponse().jdTasksByRoleId,
    matchingByRoleId: createManyRolesResponse().matchingByRoleId,
    variant: "default",
  },
})

export const MobileLayout = meta.story({
  args: {
    content: { status: "ready", data: createRoleStoryResponse("multipleRoles") },
    jdTasksByRoleId: createRoleStoryResponse("multipleRoles").jdTasksByRoleId,
    matchingByRoleId: createRoleStoryResponse("multipleRoles").matchingByRoleId,
    variant: "default",
  },
  globals: { viewport: { isRotated: false, value: "mobile1" } },
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByTestId("mobile-role-selector-trigger"))
    await expect(
      await screen.findByRole("option", { name: new RegExp(currentRole.title) }),
    ).toHaveTextContent(/当前岗位|current role/i)
    await userEvent.click(screen.getByRole("option", { name: new RegExp(selectedRole.title) }))
    await expect(screen.getByRole("heading", { name: selectedRole.title })).toBeVisible()
    await expect(screen.getByTestId("mobile-role-selector-trigger")).toHaveTextContent(
      selectedRole.title,
    )
  },
})

export const LongJobDescriptionPage = meta.story({
  args: {
    content: { status: "ready", data: createLongJobDescriptionResponse() },
    jdTasksByRoleId: createLongJobDescriptionResponse().jdTasksByRoleId,
    matchingByRoleId: createLongJobDescriptionResponse().matchingByRoleId,
    variant: "default",
  },
  play: async ({ userEvent }) => {
    await expect(screen.queryByTestId("job-description-analysis")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("tab", { name: /岗位 JD|job description/i }))
    await expect(screen.getByTestId("job-description-analysis")).toBeVisible()
  },
})

export const LongMatchingAnalysisPage = meta.story({
  args: {
    content: { status: "ready", data: createLongMatchingAnalysisResponse() },
    jdTasksByRoleId: createLongMatchingAnalysisResponse().jdTasksByRoleId,
    matchingByRoleId: createLongMatchingAnalysisResponse().matchingByRoleId,
    variant: "default",
  },
  play: async ({ userEvent }) => {
    await expect(screen.queryByTestId("matching-analysis-result")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("tab", { name: /匹配分析|match analysis/i }))
    await expect(screen.getByTestId("matching-analysis-result")).toBeVisible()
  },
})
