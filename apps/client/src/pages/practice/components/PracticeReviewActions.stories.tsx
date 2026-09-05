import preview from "#storybook/preview"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import {
  createPracticeReviewStoryFixture,
  getVisiblePracticeEndDialog,
} from "../stories/practice-story-fixtures"
import { PracticeReviewActions } from "./PracticeReviewActions"

function createDefaultArgs() {
  const question = createPracticeReviewStoryFixture("balanced").question
  return {
    interactionLocked: false,
    isEndPending: false,
    isWeak: question.isWeak,
    isNextPending: false,
    isRetryPending: false,
    isSaved: question.isSaved,
    isSavedPending: false,
    isWeakPending: false,
    onEndSession: fn(async () => "executed" as const),
    onNextQuestion: fn(async () => "executed" as const),
    onRetryCurrent: fn(async () => "executed" as const),
    onSetSaved: fn(async () => "executed" as const),
    onSetWeak: fn(async () => "executed" as const),
  }
}

const meta = preview.meta({
  component: PracticeReviewActions,
  title: "Practice/PracticeReviewActions",
})

export const Default = meta.story({
  args: createDefaultArgs(),
})

export const SavedAndMarkedWeak = meta.story({
  args: {
    ...createDefaultArgs(),
    isWeak: true,
    isSaved: true,
  },
  play: async ({ canvas }) => {
    const saved = canvas.getByRole("button", {
      name: /取消收藏|remove from saved/i,
    })
    const weak = canvas.getByRole("button", {
      name: /取消薄弱标记|remove weak mark/i,
    })
    await expect(saved).toHaveAttribute("aria-pressed", "true")
    await expect(weak).toHaveAttribute("aria-pressed", "true")
    await expect(saved.querySelector(".lucide-bookmark")).toHaveClass(
      "fill-destructive",
      "text-destructive",
    )
    await expect(weak.querySelector(".lucide-brain")).toHaveClass("text-amber-500")
  },
})

export const Pending = meta.story({
  args: {
    ...createDefaultArgs(),
    interactionLocked: true,
    isEndPending: true,
    isNextPending: true,
    isRetryPending: true,
    isSavedPending: true,
    isWeakPending: true,
  },
  play: async ({ canvas }) => {
    for (const button of canvas.getAllByRole("button")) {
      await expect(button).toBeDisabled()
    }
    await expect(
      canvas
        .getByRole("button", { name: /重练当前题|retry current question/i })
        .querySelector('[data-slot="spinner"]'),
    ).toBeVisible()
  },
})

const retryFailure = fn(async () => {
  throw new Error("detail=private retry stack")
})

export const RetryFailure = meta.story({
  args: {
    ...createDefaultArgs(),
    onRetryCurrent: retryFailure,
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /重练当前题|retry current question/i }),
    )
    await expect(retryFailure).toHaveBeenCalledTimes(1)
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(canvas.getByRole("alert")).not.toHaveTextContent(/detail|private|retry stack/i)
  },
})

const nextFailure = fn(async () => {
  throw new Error("detail=private next stack")
})

export const NextQuestionFailure = meta.story({
  args: {
    ...createDefaultArgs(),
    onNextQuestion: nextFailure,
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /继续下一题|next question/i }))
    await expect(nextFailure).toHaveBeenCalledTimes(1)
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(canvas.getByRole("alert")).not.toHaveTextContent(/detail|private|next stack/i)
  },
})

const endFailureThenSuccess = fn(async () => {
  if (endFailureThenSuccess.mock.calls.length === 1) {
    throw new Error("detail end stack")
  }
  return "executed" as const
})

export const EndFailureRetry = meta.story({
  args: {
    ...createDefaultArgs(),
    onEndSession: endFailureThenSuccess,
  },
  play: async ({ canvas }) => {
    endFailureThenSuccess.mockClear()

    await userEvent.click(
      canvas.getByRole("button", {
        name: /结束本轮练习|end this session/i,
      }),
    )

    const dialog = await getVisiblePracticeEndDialog()
    const confirmButton = within(dialog).getByRole("button", {
      name: /结束本轮练习|end this session/i,
    })

    await waitFor(() => {
      expect(confirmButton).toBeVisible()
      expect(confirmButton).toBeEnabled()
    })

    await userEvent.click(confirmButton)

    await waitFor(() => {
      expect(endFailureThenSuccess).toHaveBeenCalledTimes(1)
      expect(dialog).toBeVisible()
    })

    const errorAlert = await within(dialog).findByRole("alert")

    await waitFor(() => {
      expect(errorAlert).toBeVisible()
    })

    await expect(errorAlert).not.toHaveTextContent(/detail|end stack/i)

    await userEvent.click(
      within(dialog).getByRole("button", {
        name: /结束本轮练习|end this session/i,
      }),
    )

    await waitFor(() => {
      expect(endFailureThenSuccess).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(dialog).not.toBeVisible()
    })
  },
})

const endConfirmation = fn(async () => "executed" as const)

export const EndConfirmation = meta.story({
  args: {
    ...createDefaultArgs(),
    onEndSession: endConfirmation,
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /结束本轮练习|end this session/i }))
    await expect(endConfirmation).not.toHaveBeenCalled()
    const firstDialog = await getVisiblePracticeEndDialog()
    await userEvent.click(
      within(firstDialog).getByRole("button", { name: /继续回答|keep answering/i }),
    )
    await waitFor(() => expect(firstDialog).not.toBeVisible())

    await userEvent.click(canvas.getByRole("button", { name: /结束本轮练习|end this session/i }))
    const secondDialog = await getVisiblePracticeEndDialog()
    await userEvent.click(
      within(secondDialog).getByRole("button", {
        name: /结束本轮练习|end this session/i,
      }),
    )
    await expect(endConfirmation).toHaveBeenCalledTimes(1)
  },
})

export const Mobile = meta.story({
  args: createDefaultArgs(),
  globals: { viewport: { isRotated: false, value: "mobile1" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-review-actions")).toHaveClass(
      "grid-cols-1",
      "min-[360px]:grid-cols-2",
      "sm:flex",
    )
  },
})

export const EnglishMobile = meta.story({
  args: createDefaultArgs(),
  globals: {
    locale: "en",
    viewport: { isRotated: false, value: "mobile1" },
  },
  play: async ({ canvas }) => {
    const actions = canvas.getByTestId("practice-review-actions")
    await expect(actions.scrollWidth).toBeLessThanOrEqual(actions.clientWidth)
  },
})
