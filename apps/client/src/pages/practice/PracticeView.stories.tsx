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
    answeringActions: {
      onEnd: fn(async () => "executed" as const),
      onRequestFramework: fn(async () => "executed" as const),
      onRequestHint: fn(async () => "executed" as const),
      onSetSaved: fn(async () => "executed" as const),
      onSetWeak: fn(async () => "executed" as const),
      onSkip: fn(async () => "executed" as const),
      onSubmitAnswer: fn(async () => "executed" as const),
    },
    answeringPending: {
      end: false,
      framework: false,
      hint: false,
      interactionLocked: false,
      saved: false,
      skip: false,
      submitAnswer: false,
      weak: false,
    },
    content: { data: createPracticeMockResponse(scenario), status: "ready" as const },
    generationError: false,
    isGenerationRetrying: false,
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

export const InteractionLocked = meta.story({
  args: {
    ...readyArgs("answeringQuestion"),
    answeringPending: {
      ...readyArgs("answeringQuestion").answeringPending,
      hint: true,
      interactionLocked: true,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /请求提示|request hint/i })).toBeDisabled()
    await expect(
      canvas.getByRole("button", { name: /请求答题框架|request answer framework/i }),
    ).toBeDisabled()
    await expect(canvas.getByRole("button", { name: /收藏题目|save question/i })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: /标记为薄弱题|mark as weak/i })).toBeDisabled()
    await expect(canvas.getByRole("textbox")).toBeEnabled()
  },
})
