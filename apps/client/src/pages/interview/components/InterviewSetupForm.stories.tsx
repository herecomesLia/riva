import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { createInterviewSetupStoryFixture } from "../stories/interview-story-fixtures"
import { InterviewSetupForm } from "./InterviewSetupForm"

const meta = preview.meta({
  component: InterviewSetupForm,
  title: "Interview/InterviewSetupForm",
})

export const Default = meta.story({
  args: {
    setup: createInterviewSetupStoryFixture(),
    isPending: false,
    onStart: fn(async () => undefined),
  },
})

export const Starting = meta.story({
  args: {
    setup: createInterviewSetupStoryFixture(),
    isPending: true,
    onStart: fn(async () => undefined),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /正在准备面试|preparing interview/i }),
    ).toBeDisabled()
  },
})
