import preview from "#storybook/preview"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import { createRolesMockResponse } from "@/mocks/data/roles"
import type { RolesPageResponse } from "@/models/roles"

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

function createTransitionGate() {
  let release!: () => void
  let promise: Promise<void>

  function reset() {
    promise = new Promise<void>((resolve) => {
      release = resolve
    })
  }

  reset()
  return { release: () => release(), reset, wait: () => promise }
}

function createParsingResponse(
  initial: RolesPageResponse,
  rawText: string,
  incrementJobDescriptionVersion: boolean,
) {
  const response = structuredClone(initial)
  const role = response.roles[0]!
  const currentJobDescriptionVersion = role.jobDescription.version ?? 0
  response.roles[0] = {
    ...role,
    version: role.version + 1,
    jobDescription: {
      status: "parsing",
      rawText,
      version: incrementJobDescriptionVersion
        ? currentJobDescriptionVersion + 1
        : currentJobDescriptionVersion,
      parsingFailureReason: null,
    },
    jobDescriptionAnalysis: null,
    matchingAnalysis:
      role.matchingAnalysis?.status === "current"
        ? { ...role.matchingAnalysis, status: "stale" }
        : role.matchingAnalysis,
  }
  return response
}

function createReadyResponse(parsing: RolesPageResponse, summary: string) {
  const response = structuredClone(parsing)
  const role = response.roles[0]!
  if (role.jobDescription.status !== "parsing") {
    throw new globalThis.Error("Expected a parsing JD story response.")
  }
  const analysisTemplate = createRolesMockResponse("roleWithParsedJobDescription").roles[0]!
    .jobDescriptionAnalysis!
  response.roles[0] = {
    ...role,
    version: role.version + 1,
    jobDescription: {
      ...role.jobDescription,
      status: "ready",
    },
    jobDescriptionAnalysis: {
      ...analysisTemplate,
      coreRequirementsSummary: summary,
      jobDescriptionVersion: role.jobDescription.version,
    },
  }
  return response
}

const missingJdInitial = createRolesMockResponse("singleRoleWithoutJobDescription")
const missingJdRawText =
  "Lead React architecture and TypeScript delivery for a merchant operations platform."
const missingJdParsing = createParsingResponse(missingJdInitial, missingJdRawText, true)
const missingJdSummary = "Lead scalable React delivery for complex merchant workflows."
const missingJdReady = createReadyResponse(missingJdParsing, missingJdSummary)
const missingJdGate = createTransitionGate()

export const JobDescriptionMissing = meta.story({
  render: () => (
    <RolesStoryHarness
      actions={{ saveJobDescription: fn(async () => missingJdParsing) }}
      initialData={missingJdInitial}
      transitions={{
        saveJobDescription: async () => {
          await missingJdGate.wait()
          return missingJdReady
        },
      }}
    />
  ),
  play: async ({ userEvent }) => {
    missingJdGate.reset()
    await userEvent.click(screen.getByRole("button", { name: /粘贴 JD|paste JD/i }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByLabelText(/JD 文本|JD text/i), missingJdRawText)
    await userEvent.click(
      within(dialog).getByRole("button", { name: /保存并解析|save and parse/i }),
    )
    await waitFor(() => expect(screen.getAllByText(/解析中|parsing/i).length).toBeGreaterThan(0))
    missingJdGate.release()
    await expect(screen.findByText(missingJdSummary)).resolves.toBeVisible()
  },
})

export const JobDescriptionParsing = meta.story({
  args: {
    content: {
      status: "ready",
      data: createRolesMockResponse("roleWithJobDescriptionParsing"),
    },
    variant: "default",
  },
})

const failedJdInitial = createRolesMockResponse("roleWithJobDescriptionFailed")

export const JobDescriptionFailed = meta.story({
  args: {
    content: { status: "ready", data: failedJdInitial },
    variant: "default",
  },
})

const failedRole = failedJdInitial.roles[0]!
const retryJdParsing = createParsingResponse(
  failedJdInitial,
  failedRole.jobDescription.rawText!,
  false,
)
const retryJdSummary = "Build reliable creator-facing web products with measurable performance."
const retryJdReady = createReadyResponse(retryJdParsing, retryJdSummary)
const retryJdGate = createTransitionGate()

export const JobDescriptionRetry = meta.story({
  render: () => (
    <RolesStoryHarness
      actions={{ retryJobDescriptionParsing: fn(async () => retryJdParsing) }}
      initialData={failedJdInitial}
      transitions={{
        retryJobDescriptionParsing: async () => {
          await retryJdGate.wait()
          return retryJdReady
        },
      }}
    />
  ),
  play: async ({ userEvent }) => {
    retryJdGate.reset()
    await userEvent.click(screen.getByRole("button", { name: /重试解析|retry parsing/i }))
    await waitFor(() => expect(screen.getAllByText(/解析中|parsing/i).length).toBeGreaterThan(0))
    retryJdGate.release()
    await expect(screen.findByText(retryJdSummary)).resolves.toBeVisible()
  },
})

export const JobDescriptionReady = meta.story({
  args: {
    content: {
      status: "ready",
      data: createRolesMockResponse("roleWithParsedJobDescription"),
    },
    variant: "default",
  },
})

const replaceJdInitial = createRolesMockResponse("matchingAnalysisCurrent")
const replacementRawText =
  "Own platform engineering delivery, reliability standards, and cross-team technical direction."
const replaceJdParsing = createParsingResponse(replaceJdInitial, replacementRawText, true)
const replacementSummary = "Own reliable platform delivery and cross-team technical direction."
const replaceJdReady = createReadyResponse(replaceJdParsing, replacementSummary)
const replaceJdGate = createTransitionGate()

export const ReplaceJobDescription = meta.story({
  render: () => (
    <RolesStoryHarness
      actions={{ saveJobDescription: fn(async () => replaceJdParsing) }}
      initialData={replaceJdInitial}
      transitions={{
        saveJobDescription: async () => {
          await replaceJdGate.wait()
          return replaceJdReady
        },
      }}
    />
  ),
  play: async ({ userEvent }) => {
    replaceJdGate.reset()
    await userEvent.click(screen.getByRole("button", { name: /替换 JD|replace JD/i }))
    const dialog = await screen.findByRole("dialog")
    const input = within(dialog).getByLabelText(/JD 文本|JD text/i)
    await userEvent.clear(input)
    await userEvent.type(input, replacementRawText)
    await userEvent.click(
      within(dialog).getByRole("button", { name: /保存并解析|save and parse/i }),
    )
    await waitFor(() => {
      expect(screen.getAllByText(/解析中|parsing/i).length).toBeGreaterThan(0)
      expect(screen.queryByTestId("job-description-analysis")).not.toBeInTheDocument()
    })
    replaceJdGate.release()
    await expect(screen.findByText(replacementSummary)).resolves.toBeVisible()
  },
})

const synchronizationErrorData = createRolesMockResponse("roleWithJobDescriptionParsing")

export const JobDescriptionSynchronizationError = meta.story({
  render: () => (
    <RolesStoryHarness
      actions={{}}
      initialData={synchronizationErrorData}
      jobDescriptionSynchronizationErrorRoleIds={[synchronizationErrorData.roles[0]!.id]}
    />
  ),
})
