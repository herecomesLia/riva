import preview from "#storybook/preview"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import { createProfileMockSnapshot } from "@/mocks/data/profile"
import { ProfileView } from "./ProfileView"
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
  autoAdvance = false,
) {
  return meta.story({
    render: () => <ProfileStoryHarness autoAdvance={autoAdvance} scenario={scenario} />,
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

export const NoProfile = meta.story({
  render: () => <ProfileStoryHarness advanceDelay={50} autoAdvance scenario="noProfile" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText(/简历文本|resume text/i), "Frontend engineer resume")
    await userEvent.click(canvas.getByRole("button", { name: /上传并识别|upload and recognize/i }))

    await waitFor(() =>
      expect(canvas.getByTestId("profile-processing-state")).toHaveTextContent(
        /正在识别简历|recognizing your resume/i,
      ),
    )
    await waitFor(() => expect(canvas.getByTestId("profile-import-success")).toBeInTheDocument())
    await expect(canvas.getByTestId("profile-section-education")).toBeInTheDocument()
  },
})
export const ManualEmptyProfile = pageStory("emptyManualProfile")
export const Ready = pageStory("complete")
export const Partial = pageStory("partial")
export const NoResume = meta.story({
  render: () => (
    <ProfileStoryHarness advanceDelay={50} autoAdvance scenario="profileWithoutResume" />
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /上传简历|upload resume/i }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByLabelText(/简历文本|resume text/i), "Profile resume")
    await userEvent.click(
      within(dialog).getByRole("button", { name: /上传并识别|upload and recognize/i }),
    )

    await waitFor(() =>
      expect(canvas.getByTestId("profile-processing-state")).toHaveTextContent(
        /正在识别简历|recognizing your resume/i,
      ),
    )
    await waitFor(() =>
      expect(canvas.getByTestId("profile-resume-update-success")).toBeInTheDocument(),
    )
  },
})
export const UploadingResume = pageStory("initialResumeUploading")
export const ParsingResume = pageStory("initialResumeRecognizing")
export const RecognitionFailed = meta.story({
  render: () => (
    <ProfileStoryHarness advanceDelay={50} autoAdvance scenario="initialResumeRecognitionFailed" />
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /重新识别|recognize again/i }))

    await waitFor(() =>
      expect(canvas.getByTestId("profile-processing-state")).toHaveTextContent(
        /正在识别简历|recognizing your resume/i,
      ),
    )
    await waitFor(() => expect(canvas.getByTestId("profile-import-success")).toBeInTheDocument())
    await expect(canvas.queryByTestId("profile-recognition-failure")).not.toBeInTheDocument()
  },
})
export const AfterInitialImport = pageStory("initialResumeRecognitionSucceeded")
export const AfterResumeUpdate = pageStory("resumeUpdateSucceeded")

export const EditableProfile = meta.story({
  render: () => <ProfileStoryHarness autoAdvance scenario="complete" />,
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

export const ResumeUpdateFlow = meta.story({
  render: () => <ProfileStoryHarness advanceDelay={50} autoAdvance scenario="complete" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /更新简历|update resume/i }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: /更新简历|update resume/i,
      }),
    )
    await userEvent.type(
      within(dialog).getByLabelText(/简历文本|resume text/i),
      "Updated frontend resume",
    )
    await userEvent.click(
      within(dialog).getByRole("button", { name: /上传并识别|upload and recognize/i }),
    )

    await waitFor(() =>
      expect(canvas.getByTestId("profile-processing-state")).toHaveTextContent(
        /正在识别简历|recognizing your resume/i,
      ),
    )
    await waitFor(() =>
      expect(canvas.getByTestId("profile-resume-update-success")).toBeInTheDocument(),
    )
  },
})

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
