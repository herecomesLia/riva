import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"

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
    followUpActions: {
      onEndFollowUps: fn(async () => "executed" as const),
      onSubmitFollowUp: fn(async () => "executed" as const),
    },
    followUpPending: {
      end: false,
      interactionLocked: false,
      submit: false,
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

export const SingleFollowUp = meta.story({
  args: readyArgs("answeringSingleFollowUp"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-answering-follow-up-state")).toBeVisible()
    await expect(canvas.getAllByRole("textbox")).toHaveLength(1)
  },
})

export const MultipleFollowUps = meta.story({
  args: readyArgs("answeringFollowUp"),
  play: async ({ canvas }) => {
    const timeline = canvas.getByTestId("practice-conversation-timeline")
    await expect(timeline).toBeVisible()
    await expect(timeline).toHaveTextContent(/追问 1|Follow-up 1/i)
    await expect(timeline).toHaveTextContent(/当前追问 2|Current follow-up 2/i)
  },
})

export const WaitingForFollowUp = meta.story({
  args: {
    ...readyArgs("answeringFollowUp"),
    followUpPending: { end: false, interactionLocked: true, submit: true },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/正在分析回答并准备下一步|reviewing your answer and preparing/i),
    ).toBeVisible()
  },
})

const rejectedFollowUp = fn(async () => {
  throw new Error("unsafe story error")
})

export const FollowUpSubmitError = meta.story({
  args: {
    ...readyArgs("answeringSingleFollowUp"),
    followUpActions: {
      ...readyArgs("answeringSingleFollowUp").followUpActions,
      onSubmitFollowUp: rejectedFollowUp,
    },
  },
  play: async ({ canvas }) => {
    const textbox = canvas.getByRole("textbox")
    await userEvent.type(textbox, "失败后保留的追问回答")
    await userEvent.click(
      canvas.getByRole("button", { name: /提交追问回答|submit follow-up answer/i }),
    )
    await expect(rejectedFollowUp).toHaveBeenCalled()
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(textbox).toHaveValue("失败后保留的追问回答")
  },
})

export const FollowUpCompleted = meta.story({
  args: readyArgs("evaluatingAnswer"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-evaluating-state")).toBeVisible()
    await expect(canvas.getByTestId("practice-conversation-timeline")).toBeVisible()
  },
})

export const NoFollowUpRequired = meta.story({
  args: readyArgs("evaluatingNoFollowUp"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-evaluating-state")).toBeVisible()
    await expect(canvas.queryByText(/追问 1|Follow-up 1/i)).not.toBeInTheDocument()
  },
})
