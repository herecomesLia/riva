import preview from "#storybook/preview"
import { fn } from "storybook/test"

import { CareerProfileExtractionDialog } from "./CareerProfileExtractionDialog"

const meta = preview.meta({
  component: CareerProfileExtractionDialog,
  title: "Profile/CareerProfileExtractionDialog",
})

export const ExistingProfile = meta.story({
  args: {
    hasProfile: true,
    actionError: null,
    isSubmitting: false,
    onOpenChange: fn(),
    onSubmit: fn(async () => undefined),
    open: true,
  },
})

export const SubmissionError = meta.story({
  args: {
    hasProfile: false,
    actionError: "Unable to submit extraction.",
    isSubmitting: false,
    onOpenChange: fn(),
    onSubmit: fn(async () => undefined),
    open: true,
  },
})
