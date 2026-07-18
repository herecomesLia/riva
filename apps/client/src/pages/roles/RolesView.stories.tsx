import preview from "#storybook/preview"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import { createRolesMockResponse } from "@/mocks/data/roles"

import { withRouter } from "#storybook/decorators/with-router"
import { RolesView } from "./RolesView"
import { RolesStoryHarness } from "./roles-story-harness"

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

const createInitial = createRolesMockResponse("noRoles")
const createResult = createRolesMockResponse("singleRoleWithoutJobDescription")
const createRoleAction = fn(async (input) => {
  const response = structuredClone(createResult)
  Object.assign(response.roles[0]!, input)
  return response
})

export const CreateRole = meta.story({
  render: () => (
    <RolesStoryHarness
      actions={{ createTargetRole: createRoleAction }}
      initialData={createInitial}
    />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /添加目标岗位|add target role/i }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(
      within(dialog).getByLabelText(/岗位名称|role title/i),
      createResult.roles[0]!.title,
    )
    await userEvent.click(within(dialog).getByRole("button", { name: /^保存$|^save$/i }))
    await expect(
      screen.findByRole("heading", { name: createResult.roles[0]!.title }),
    ).resolves.toBeVisible()
  },
})

const editInitial = createRolesMockResponse("singleRoleWithoutJobDescription")
const editedTitle = "Principal Frontend Engineer"
const editRoleAction = fn(async (input) => {
  const response = structuredClone(editInitial)
  Object.assign(response.roles[0]!, input, { version: input.version + 1 })
  return response
})

export const EditRole = meta.story({
  render: () => (
    <RolesStoryHarness actions={{ updateTargetRole: editRoleAction }} initialData={editInitial} />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /编辑信息|edit details/i }))
    const dialog = await screen.findByRole("dialog")
    const title = within(dialog).getByLabelText(/岗位名称|role title/i)
    await userEvent.clear(title)
    await userEvent.type(title, editedTitle)
    await userEvent.click(within(dialog).getByRole("button", { name: /^保存$|^save$/i }))
    await expect(screen.findByRole("heading", { name: editedTitle })).resolves.toBeVisible()
  },
})

const currentInitial = createRolesMockResponse("multipleRoles")
const nextCurrentRole = currentInitial.roles.find((role) => !role.isCurrent)!
const currentResult = structuredClone(currentInitial)
currentResult.currentRoleId = nextCurrentRole.id
currentResult.roles.forEach((role) => {
  role.isCurrent = role.id === nextCurrentRole.id
})

export const SetCurrentRole = meta.story({
  render: () => (
    <RolesStoryHarness
      actions={{ setCurrentTargetRole: fn(async () => currentResult) }}
      initialData={currentInitial}
    />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${nextCurrentRole.title}`) }),
    )
    await userEvent.click(screen.getByRole("button", { name: /设为当前岗位|set as current role/i }))
    const roleButton = screen.getByRole("button", { name: new RegExp(`^${nextCurrentRole.title}`) })
    await waitFor(() =>
      expect(within(roleButton).getByText(/当前岗位|current role/i)).toBeVisible(),
    )
  },
})

const preparationInitial = createRolesMockResponse("singleRoleWithoutJobDescription")
const pausedResult = structuredClone(preparationInitial)
pausedResult.roles[0]!.preparationStatus = "paused"
pausedResult.roles[0]!.version += 1
const resumedResult = structuredClone(pausedResult)
resumedResult.roles[0]!.preparationStatus = "preparing"
resumedResult.roles[0]!.version += 1
const preparationAction = fn()
  .mockResolvedValueOnce(pausedResult)
  .mockResolvedValueOnce(resumedResult)

export const PauseAndResumeRole = meta.story({
  render: () => (
    <RolesStoryHarness
      actions={{ updateRolePreparationStatus: preparationAction }}
      initialData={preparationInitial}
    />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /暂停准备|pause preparation/i }))
    await waitFor(() => expect(screen.getAllByText(/已暂停|paused/i).length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole("button", { name: /继续准备|resume preparation/i }))
    await waitFor(() => expect(screen.getAllByText(/准备中|preparing/i).length).toBeGreaterThan(0))
  },
})

const archiveInitial = createRolesMockResponse("singleRoleWithoutJobDescription")
const archiveResult = structuredClone(archiveInitial)
archiveResult.roles[0]!.preparationStatus = "archived"
archiveResult.roles[0]!.isCurrent = false
archiveResult.roles[0]!.version += 1
archiveResult.currentRoleId = null

export const ArchiveRole = meta.story({
  render: () => (
    <RolesStoryHarness
      actions={{ archiveTargetRole: fn(async () => archiveResult) }}
      initialData={archiveInitial}
    />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /归档岗位|archive role/i }))
    const confirmation = await screen.findByRole("alertdialog")
    await userEvent.click(
      within(confirmation).getByRole("button", { name: /归档岗位|archive role/i }),
    )
    await waitFor(() => expect(screen.getAllByText(/已归档|archived/i).length).toBeGreaterThan(0))
  },
})

const deleteInitial = createRolesMockResponse("multipleRoles")
const deletedRole = deleteInitial.roles.find((role) => !role.isCurrent)!
const deleteResult = structuredClone(deleteInitial)
deleteResult.roles = deleteResult.roles.filter((role) => role.id !== deletedRole.id)

export const DeleteRole = meta.story({
  render: () => (
    <RolesStoryHarness
      actions={{ deleteTargetRole: fn(async () => deleteResult) }}
      initialData={deleteInitial}
      initialSelectedRoleId={deletedRole.id}
    />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /删除岗位|delete role/i }))
    const confirmation = await screen.findByRole("alertdialog")
    await userEvent.click(
      within(confirmation).getByRole("button", { name: /删除岗位|delete role/i }),
    )
    await waitFor(() => expect(screen.queryByText(deletedRole.title)).not.toBeInTheDocument())
  },
})

const deleteCurrentInitial = createRolesMockResponse("multipleRoles")
const deletedCurrentRole = deleteCurrentInitial.roles.find((role) => role.isCurrent)!
const deleteCurrentResult = structuredClone(deleteCurrentInitial)
deleteCurrentResult.roles = deleteCurrentResult.roles.filter(
  (role) => role.id !== deletedCurrentRole.id,
)
deleteCurrentResult.roles.forEach((role) => {
  role.isCurrent = false
})
deleteCurrentResult.currentRoleId = null

export const DeleteCurrentRole = meta.story({
  render: () => (
    <RolesStoryHarness
      actions={{ deleteTargetRole: fn(async () => deleteCurrentResult) }}
      initialData={deleteCurrentInitial}
    />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /删除岗位|delete role/i }))
    const confirmation = await screen.findByRole("alertdialog")
    await userEvent.click(
      within(confirmation).getByRole("button", { name: /删除岗位|delete role/i }),
    )
    await expect(
      screen.findByText(/尚未设置当前默认岗位|no current default role/i),
    ).resolves.toBeVisible()
    await waitFor(() =>
      expect(screen.queryByText(deletedCurrentRole.title)).not.toBeInTheDocument(),
    )
  },
})
