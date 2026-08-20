import preview from "#storybook/preview"
import { fn } from "storybook/test"

import { createProfileMockSnapshot } from "@/mocks/data/profile"
import type { JobProfileSnapshot } from "@/models/profile"

import { ProfileResumeDialog } from "./ProfileResumeDialog"

function createArgs(snapshot: JobProfileSnapshot, mode: "details" | "import") {
  return {
    importError: null,
    isSubmitting: false,
    mode,
    onModeChange: fn(),
    onOpenChange: fn(),
    onSubmit: fn(async () => undefined),
    open: true,
    profile: snapshot.profile!,
  }
}

const meta = preview.meta({
  component: ProfileResumeDialog,
  title: "Profile/ProfileResumeDialog",
})

export const ExistingResume = meta.story({
  args: createArgs(createProfileMockSnapshot(), "details"),
})

export const NoResume = meta.story({
  args: createArgs(createProfileMockSnapshot("profileWithoutResume"), "import"),
})

export const UpdateForm = meta.story({
  args: createArgs(createProfileMockSnapshot(), "import"),
})
