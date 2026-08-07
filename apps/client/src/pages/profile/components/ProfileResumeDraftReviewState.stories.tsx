import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { createResumeDraftStoryFixture } from "../profile-resume-draft-story-fixtures"
import { ProfileResumeDraftReviewState } from "./ProfileResumeDraftReviewState"

const meta = preview.meta({
  component: ProfileResumeDraftReviewState,
  title: "Profile/ResumeDraftReview",
})

const defaultArgs = {
  applyConflict: null,
  applyError: false,
  isApplying: false,
  onApply: fn(),
  onCancel: fn(),
}

export const FirstImport = meta.story({
  args: { ...defaultArgs, draft: createResumeDraftStoryFixture("firstImport"), onApply: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByTestId("resume-draft-overview")).toBeInTheDocument()
    await expect(canvas.getByTestId("resume-draft-summary")).toBeInTheDocument()
    await expect(canvas.getByTestId("resume-draft-education")).toBeInTheDocument()
    await expect(canvas.getByTestId("resume-draft-work")).toBeInTheDocument()
    await expect(canvas.getByTestId("resume-draft-projects")).toBeInTheDocument()
    await expect(canvas.getByTestId("resume-draft-skills")).toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: /确认导入|confirm import/i }))
    await expect(args.onApply).toHaveBeenCalledTimes(1)
  },
})

export const ExistingProfileUpdate = meta.story({
  args: { ...defaultArgs, draft: createResumeDraftStoryFixture("existingProfile") },
})

export const ProtectedChanges = meta.story({
  args: { ...defaultArgs, draft: createResumeDraftStoryFixture("protected") },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("resume-draft-protected-items")).toBeInTheDocument()
  },
})

export const SkippedAndUnresolved = meta.story({
  args: { ...defaultArgs, draft: createResumeDraftStoryFixture("skippedAndUnresolved") },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("resume-draft-skipped-items")).toBeInTheDocument()
    await expect(canvas.getByTestId("resume-draft-unresolved-items")).toBeInTheDocument()
  },
})

export const Conflict = meta.story({
  args: {
    ...defaultArgs,
    applyConflict: "resume_import_profile_version_conflict",
    draft: createResumeDraftStoryFixture("existingProfile"),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("profile-resume-draft-conflict")).toBeInTheDocument()
  },
})

export const ApplyError = meta.story({
  args: {
    ...defaultArgs,
    applyError: true,
    draft: createResumeDraftStoryFixture("existingProfile"),
  },
})

export const Applying = meta.story({
  args: {
    ...defaultArgs,
    draft: createResumeDraftStoryFixture("existingProfile"),
    isApplying: true,
  },
  play: async ({ canvas }) => {
    const buttons = canvas.getAllByRole("button")
    await expect(buttons).toHaveLength(2)
    await expect(buttons[0]).toBeDisabled()
    await expect(buttons[1]).toBeDisabled()
  },
})

export const Minimal = meta.story({
  args: { ...defaultArgs, draft: createResumeDraftStoryFixture("minimal") },
})
