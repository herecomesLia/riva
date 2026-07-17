import preview from "#storybook/preview"
import { fn } from "storybook/test"

import {
  ProfileProcessingState,
  ProfileRecognitionFailureState,
} from "./components/ProfilePageStates"

const meta = preview.meta({
  title: "Profile/Components/PageStates",
})

export const Recognizing = meta.story({
  render: () => <ProfileProcessingState status="parsingResume" />,
})

export const RecognitionFailure = meta.story({
  render: () => (
    <ProfileRecognitionFailureState
      failureReason="The resume could not be recognized because its text layer is unavailable."
      onManualEntry={fn()}
      onReupload={fn()}
      onRetry={fn()}
    />
  ),
})
