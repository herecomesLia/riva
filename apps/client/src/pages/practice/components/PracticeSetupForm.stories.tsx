import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { createPracticeMockResponse } from "@/mocks/data/practice"

import { PracticeSetupForm } from "./PracticeSetupForm"

const response = createPracticeMockResponse("setupReady")
if (response.session.selection.targetRoleId === null) {
  throw new Error("The setup fixture must select a target role.")
}

const meta = preview.meta({
  component: PracticeSetupForm,
  title: "Practice/Components/SetupForm",
})

const defaultArgs = {
  context: response.setupContext,
  initialSelection: {
    ...response.session.selection,
    targetRoleId: response.session.selection.targetRoleId,
  },
  isPending: false,
  onStart: fn(async () => undefined),
}

export const Default = meta.story({
  args: defaultArgs,
})

export const Pending = meta.story({
  args: { ...defaultArgs, isPending: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /正在开始|starting/i })).toBeDisabled()
  },
})
