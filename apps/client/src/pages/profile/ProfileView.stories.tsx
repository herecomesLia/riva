import preview from "#storybook/preview"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import { createProfileMockSnapshot } from "@/mocks/data/profile"
import { ProfileView, type ProfileViewActions } from "./ProfileView"
import type { ProfileResumeWorkflowState } from "./profile-resume-workflow"
import { createResumeDraftStoryFixture } from "./profile-resume-draft-story-fixtures"
import { ProfileStoryHarness } from "./profile-story-harness"

import { withRouter } from "#storybook/decorators/with-router"

const meta = preview.meta({
  component: ProfileView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/profile"] } },
  title: "Pages/Profile",
})

function pageStory(
  scenario: Parameters<typeof ProfileStoryHarness>[0]["scenario"],
  hasResumeDocuments?: boolean,
) {
  return meta.story({
    render: () => (
      <ProfileStoryHarness hasResumeDocuments={hasResumeDocuments} scenario={scenario} />
    ),
  })
}

function createStoryActions(): ProfileViewActions {
  return {
    applyResumeDraft: fn(async () => undefined),
    createManualProfile: fn(async () => createProfileMockSnapshot("emptyManualProfile")),
    resetResumeWorkflow: fn(),
    retryResumeWorkflow: fn(async () => undefined),
    saveSection: fn(async () => undefined),
    uploadResumeForInitialImport: fn(async () => createProfileMockSnapshot("noProfile")),
    uploadResumeForUpdate: fn(async () => createProfileMockSnapshot("complete")),
  }
}

function resumeWorkflowStory(
  snapshotScenario: Parameters<typeof createProfileMockSnapshot>[0],
  resumeWorkflow: ProfileResumeWorkflowState,
  hasResumeDocuments: boolean,
) {
  return meta.story({
    render: () => (
      <ProfileView
        actions={createStoryActions()}
        content={{
          data: createProfileMockSnapshot(snapshotScenario),
          hasResumeDocuments,
          resumeWorkflow,
          status: "ready",
        }}
        variant="default"
      />
    ),
  })
}

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

export const NoProfile = pageStory("noProfile")
export const ManualEmptyProfile = pageStory("emptyManualProfile", false)
export const Ready = pageStory("complete", true)
export const Partial = pageStory("partial")
export const NoResume = pageStory("profileWithoutResume", false)
export const UploadingResume = resumeWorkflowStory(
  "noProfile",
  {
    mode: "initial",
    status: "uploading",
  },
  true,
)
export const ParsingResume = resumeWorkflowStory(
  "noProfile",
  {
    isRetrying: false,
    mode: "initial",
    resumeId: "50000000-0000-4000-8000-000000000001",
    status: "parsing",
    synchronizationError: false,
  },
  true,
)
export const RecognitionFailed = meta.story({
  render: () => (
    <ProfileView
      actions={createStoryActions()}
      content={{
        data: createProfileMockSnapshot("noProfile"),
        hasResumeDocuments: true,
        resumeWorkflow: {
          canRetry: true,
          failureReason: "The resume layout could not be recognized.",
          isRetrying: false,
          mode: "initial",
          resumeId: "50000000-0000-4000-8000-000000000001",
          status: "failed",
        },
        status: "ready",
      }}
      variant="default"
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("profile-recognition-failure")).toBeInTheDocument()
  },
})
export const InitialResumeDraftReady = resumeWorkflowStory(
  "noProfile",
  {
    applyConflict: null,
    applyError: false,
    draft: createResumeDraftStoryFixture("firstImport"),
    mode: "initial",
    resumeId: "50000000-0000-4000-8000-000000000001",
    status: "draftReady",
  },
  true,
)
export const ExistingProfileDraftReady = resumeWorkflowStory(
  "complete",
  {
    applyConflict: null,
    applyError: false,
    draft: createResumeDraftStoryFixture("existingProfile"),
    mode: "update",
    resumeId: "50000000-0000-4000-8000-000000000001",
    status: "draftReady",
  },
  true,
)
export const EditableProfile = meta.story({
  render: () => <ProfileStoryHarness scenario="complete" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /编辑|edit/i })[0]!)
    const dialog = await screen.findByRole("dialog")
    const school = within(dialog).getAllByLabelText(/学校|school/i)[0]!
    await userEvent.clear(school)
    await userEvent.type(school, "Updated University")
    await userEvent.click(within(dialog).getByRole("button", { name: /保存|save/i }))
    await waitFor(() => expect(canvas.getByText("Updated University")).toBeInTheDocument())
  },
})

export const ResumeUpdateFlow = resumeWorkflowStory(
  "complete",
  {
    applyConflict: null,
    applyError: false,
    draft: createResumeDraftStoryFixture("protected"),
    mode: "update",
    resumeId: "50000000-0000-4000-8000-000000000001",
    status: "draftReady",
  },
  true,
)

const deletedWorkExperienceTitle =
  createProfileMockSnapshot("complete").profile!.workExperiences[0]!.title

export const DeletedWorkExperience = meta.story({
  render: () => <ProfileStoryHarness scenario="complete" />,
  play: async ({ canvas, userEvent }) => {
    const section = canvas.getByTestId("profile-section-workExperience")
    await userEvent.click(within(section).getByRole("button", { name: /编辑|edit/i }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getAllByRole("button", { name: /删除|delete/i })[0]!)
    await userEvent.click(within(dialog).getByRole("button", { name: /保存|save/i }))

    await waitFor(() =>
      expect(canvas.queryByText(deletedWorkExperienceTitle)).not.toBeInTheDocument(),
    )
  },
})
