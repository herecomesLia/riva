import preview from "#storybook/preview"
import { fn } from "storybook/test"

import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfileSnapshot, ResumeUpdate } from "@/models/profile"

import { ProfileResumeDialog } from "./ProfileResumeDialog"

function createArgs(snapshot: JobProfileSnapshot, mode: "details" | "import") {
  return {
    importError: null,
    isApplying: false,
    isCancelling: false,
    isSubmitting: false,
    mode,
    onApplyUpdate: fn(),
    onCancelUpdate: fn(),
    onModeChange: fn(),
    onOpenChange: fn(),
    onSubmit: fn(async () => undefined),
    open: true,
    profile: snapshot.profile!,
    recognition: snapshot.recognition,
    resumeUpdate: snapshot.resumeUpdate,
    updateError: null,
  }
}

const meta = preview.meta({
  component: ProfileResumeDialog,
  title: "Profile/ProfileResumeDialog",
})

export const ExistingResume = meta.story({
  args: createArgs(structuredClone(profileResponseMock), "details"),
})

const noResume = structuredClone(profileResponseMock)
noResume.profile!.resume = null

export const NoResume = meta.story({
  args: createArgs(noResume, "import"),
})

export const UpdateForm = meta.story({
  args: createArgs(structuredClone(profileResponseMock), "import"),
})

const updateReview: JobProfileSnapshot = structuredClone(profileResponseMock)
updateReview.resumeUpdate = {
  changeSummary: { changedItems: 2, missingItems: 1, newItems: 1 },
  createdAt: "2026-07-13T08:00:00.000Z",
  failureReason: null,
  id: "resume_update_uploaded",
  pendingReviewCount: 3,
  preservesManualChanges: true,
  proposedProfile: null,
  resume: structuredClone(updateReview.profile!.resume!),
  status: "awaitingConfirmation",
} satisfies ResumeUpdate

export const UpdateReview = meta.story({
  args: createArgs(updateReview, "details"),
})
