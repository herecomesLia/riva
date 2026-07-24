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

export const GeneratingQuestion = meta.story({ args: createPracticeViewArgs("generatingQuestion") })

export const GenerationError = meta.story({
  args: { ...createPracticeViewArgs("generatingQuestion"), generationError: true },
})

export const RetryingCurrentQuestion = meta.story({
  args: createPracticeViewArgs("retryingCurrentQuestion"),
})

export const GeneratingNextQuestion = meta.story({
  args: createPracticeViewArgs("generatingNextQuestion"),
})

export const NextQuestionError = meta.story({
  args: { ...createPracticeViewArgs("generatingNextQuestion"), generationError: true },
})
