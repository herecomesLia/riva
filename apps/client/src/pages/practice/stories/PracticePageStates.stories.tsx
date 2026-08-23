import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import { createPracticeViewArgs } from "./practice-story-fixtures"
import { PracticeView } from "../PracticeView"

const meta = preview.meta({
  component: PracticeView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/practice"] } },
  title: "Pages/Practice/States",
})

export const Loading = meta.story({
  args: { content: { status: "loading" }, variant: "default" },
})

export const LoadError = meta.story({
  args: { isRetrying: false, onRetry: fn(), variant: "error" },
})

export const NoRoles = meta.story({ args: createPracticeViewArgs("noRoles") })

export const DefaultSetup = meta.story({ args: createPracticeViewArgs("setupReady") })

export const HistoricalConfigurationAvailable = meta.story({
  args: {
    ...createPracticeViewArgs("setupReady"),
    trainingEntryResolution: {
      status: "available",
      configuration: createPracticeViewArgs("setupReady").content.data.session.selection,
      adjustments: [],
    },
  },
})

const unavailableRoleArgs = createPracticeViewArgs("setupReady")
if (unavailableRoleArgs.content.data.session.status !== "setup") {
  throw new Error("Practice setup fixture required.")
}
unavailableRoleArgs.content.data.session.selection.targetRoleId = null

export const HistoricalRoleUnavailable = meta.story({
  args: {
    ...unavailableRoleArgs,
    trainingEntryResolution: {
      status: "roleUnavailable",
      reason: "targetRoleArchived",
      configuration: unavailableRoleArgs.content.data.session.selection,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("history-entry-role-unavailable")).toBeVisible()
    await expect(canvas.getByRole("button", { name: /开始练习|start practice/i })).toBeDisabled()
  },
})

const adjustedPracticeArgs = createPracticeViewArgs("setupReady")
if (adjustedPracticeArgs.content.data.session.status !== "setup") {
  throw new Error("Practice setup fixture required.")
}

export const HistoricalQuestionTypeAdjusted = meta.story({
  args: {
    ...adjustedPracticeArgs,
    trainingEntryResolution: {
      status: "adjusted",
      configuration: adjustedPracticeArgs.content.data.session.selection,
      adjustments: ["practiceQuestionTypeUnsupported"],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("history-entry-adjusted")).toBeVisible()
  },
})

export const HistoricalDifficultyAdjusted = meta.story({
  args: {
    ...adjustedPracticeArgs,
    trainingEntryResolution: {
      status: "adjusted",
      configuration: adjustedPracticeArgs.content.data.session.selection,
      adjustments: ["difficultyUnavailable"],
    },
  },
})

export const HistoricalEntryFailure = meta.story({
  args: { isRetrying: false, onRetry: fn(), variant: "trainingEntryError" },
})

export const NoSavedQuestions = meta.story({
  args: createPracticeViewArgs("noEligibleSavedQuestions"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-no-saved-questions")).toBeVisible()
  },
})

export const NoHistoryQuestions = meta.story({
  args: createPracticeViewArgs("noEligibleHistoryQuestions"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-no-history-questions")).toBeVisible()
  },
})

export const GeneratedQuestion = meta.story({
  args: createPracticeViewArgs("answeringGeneratedQuestion"),
})

export const RetryingCurrentQuestion = meta.story({
  args: createPracticeViewArgs("retryingCurrentQuestion"),
})

export const NextQuestion = meta.story({
  args: createPracticeViewArgs("answeringNextQuestion"),
})
