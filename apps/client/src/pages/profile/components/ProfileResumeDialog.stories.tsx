import preview from "#storybook/preview"
import { fn } from "storybook/test"

import { ProfileResumeDialog } from "./ProfileResumeDialog"

const meta = preview.meta({
  component: ProfileResumeDialog,
  title: "Profile/ProfileResumeDialog",
})

export const ExistingProfile = meta.story({
  args: {
    hasProfile: true,
    importError: null,
    isSubmitting: false,
    onOpenChange: fn(),
    onSubmit: fn(async () => undefined),
    open: true,
  },
})

export const ImportError = meta.story({
  args: {
    hasProfile: false,
    importError: "Resume import failed.",
    isSubmitting: false,
    onOpenChange: fn(),
    onSubmit: fn(async () => undefined),
    open: true,
  },
})
