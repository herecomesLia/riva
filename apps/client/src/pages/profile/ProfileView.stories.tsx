import preview from "#storybook/preview"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import {
  careerProfileFixture,
  resumeImportedCareerProfileFixture,
} from "@/mocks/fixtures/career-profile"

import { ProfileView } from "./ProfileView"
import { ProfileStoryHarness } from "./profile-story-harness"

const meta = preview.meta({
  component: ProfileView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/profile"] } },
  title: "Pages/Profile",
})

export const Loading = meta.story({
  args: { variant: "loading" },
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
  render: () => <ProfileStoryHarness initialProfile={null} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText(/简历文本|resume text/i), "Frontend resume")
    await userEvent.click(canvas.getByRole("button", { name: /解析简历|parse resume/i }))
    await waitFor(() => expect(canvas.getByTestId("profile-section-education")).toBeInTheDocument())
  },
})

export const Ready = meta.story({ render: () => <ProfileStoryHarness /> })

const extractionArgs = {
  variant: "default" as const,
  profile: careerProfileFixture,
  extractionStateError: false,
  actions: {
    createCareerProfile: fn(async () => structuredClone(careerProfileFixture)),
    updateCareerProfile: fn(async () => structuredClone(careerProfileFixture)),
    extractCareerProfileFromText: fn(async () => undefined),
    retryCareerProfileExtraction: fn(async () => undefined),
    abortCareerProfileExtraction: fn(async () => undefined),
    retryCareerProfileExtractionState: fn(async () => undefined),
  },
}

export const Reextracting = meta.story({
  args: { ...extractionArgs, extractionState: { status: "running", error: null } },
})
export const ExtractionFailed = meta.story({
  args: {
    ...extractionArgs,
    extractionState: {
      status: "failed",
      error: { code: "invalid_output", message: "Unable to complete the task." },
    },
  },
})
export const Aborting = meta.story({
  args: { ...extractionArgs, extractionState: { status: "aborting", error: null } },
})
export const Partial = meta.story({
  render: () => (
    <ProfileStoryHarness
      initialProfile={{
        ...structuredClone(careerProfileFixture),
        education: [],
        projects: [],
      }}
    />
  ),
})

export const EditableProfile = meta.story({
  render: () => <ProfileStoryHarness />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /编辑|edit/i })[0]!)
    const dialog = await screen.findByRole("dialog")
    const school = within(dialog).getByLabelText(/学校|school/i)
    await userEvent.clear(school)
    await userEvent.type(school, "Updated University")
    await userEvent.click(within(dialog).getByRole("button", { name: /保存|save/i }))
    await waitFor(() => expect(canvas.getByText("Updated University")).toBeInTheDocument())
  },
})

export const CareerProfileExtraction = meta.story({
  render: () => <ProfileStoryHarness />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /更新简历|update resume/i }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByLabelText(/简历文本|resume text/i), "Updated resume")
    await userEvent.click(within(dialog).getByRole("button", { name: /解析简历|parse resume/i }))
    await waitFor(() =>
      expect(
        canvas.getByText(resumeImportedCareerProfileFixture.projects[0]!.name),
      ).toBeInTheDocument(),
    )
  },
})
