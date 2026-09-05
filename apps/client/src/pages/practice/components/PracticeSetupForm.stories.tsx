import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"

import { PracticeSetupForm } from "./PracticeSetupForm"

const response = createPracticeScenario("setupReady")
if (response.session.selection.targetRoleId === null) {
  throw new Error("The setup fixture must select a target role.")
}

const meta = preview.meta({
  component: PracticeSetupForm,
  title: "Practice/PracticeSetupForm",
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
    const controls = [
      ...canvas.queryAllByRole("button"),
      ...canvas.queryAllByRole("combobox"),
      ...canvas.queryAllByRole("switch"),
    ]

    await expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) {
      await expect(
        control.matches(":disabled") || control.getAttribute("aria-disabled") === "true",
      ).toBe(true)
    }
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: /正在开始|starting/i })).toBeDisabled()
  },
})

const startPractice = fn(async () => undefined)

export const StartPractice = meta.story({
  args: { ...defaultArgs, onStart: startPractice },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /开始练习|start practice/i }))
    await expect(startPractice).toHaveBeenCalledTimes(1)
    await expect(startPractice).toHaveBeenCalledWith(defaultArgs.initialSelection)
  },
})
