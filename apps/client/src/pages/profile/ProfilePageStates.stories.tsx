import preview from "#storybook/preview"
import { fn } from "storybook/test"

import { CareerProfileExtractionStatus } from "./components/CareerProfileExtractionStatus"

const meta = preview.meta({
  component: CareerProfileExtractionStatus,
  title: "Profile/CareerProfileExtractionStatus",
  args: {
    pending: false,
    synchronizationError: false,
    onRetry: fn(),
    onAbort: fn(),
    onReimport: fn(),
    onResynchronize: fn(),
  },
})

export const Recognizing = meta.story({
  args: { state: { status: "running", error: null } },
})

export const RecognitionFailure = meta.story({
  args: {
    state: {
      status: "failed",
      error: { code: "invalid_output", message: "Unable to complete the task." },
    },
  },
})

export const Aborting = meta.story({ args: { state: { status: "aborting", error: null } } })
export const SynchronizationError = meta.story({
  args: { state: undefined, synchronizationError: true },
})
