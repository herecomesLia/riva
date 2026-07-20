import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import { createPracticeMockResponse } from "@/mocks/data/practice"

import { PracticeView } from "./PracticeView"

const meta = preview.meta({
  component: PracticeView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/practice"] } },
  title: "Pages/Practice",
})

export const Loading = meta.story({
  args: { content: { status: "loading" }, variant: "default" },
})

export const LoadError = meta.story({
  args: { isRetrying: false, onRetry: fn(), variant: "error" },
})

function readyArgs(scenario: Parameters<typeof createPracticeMockResponse>[0]) {
  return {
    content: { data: createPracticeMockResponse(scenario), status: "ready" as const },
    generationError: false,
    isStarting: false,
    onRetryGeneration: fn(),
    onStart: fn(async () => undefined),
    variant: "default" as const,
  }
}

export const NoRoles = meta.story({ args: readyArgs("noRoles") })

export const DefaultSetup = meta.story({ args: readyArgs("setupReady") })

export const NoSavedQuestions = meta.story({
  args: readyArgs("noEligibleSavedQuestions"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-no-saved-questions")).toBeVisible()
  },
})

export const NoHistoryQuestions = meta.story({
  args: readyArgs("noEligibleHistoryQuestions"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-no-history-questions")).toBeVisible()
  },
})

export const GeneratingQuestion = meta.story({ args: readyArgs("generatingQuestion") })

export const GenerationError = meta.story({
  args: { ...readyArgs("generatingQuestion"), generationError: true },
})
