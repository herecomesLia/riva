import type { Meta, StoryObj } from "@storybook/tanstack-react"

import {
  ProfileProcessingState,
  ProfileRecognitionFailureState,
} from "./components/ProfilePageStates"

const meta = {
  title: "Profile/Import States",
} satisfies Meta

export default meta

export const Recognizing: StoryObj = {
  render: () => <ProfileProcessingState status="parsingResume" />,
}

export const RecognitionFailure: StoryObj = {
  render: () => (
    <ProfileRecognitionFailureState
      failureReason="The document could not be parsed."
      onManualEntry={() => {}}
      onReupload={() => {}}
      onRetry={() => {}}
    />
  ),
}
