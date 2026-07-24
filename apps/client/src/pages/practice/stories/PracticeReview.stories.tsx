import preview from "#storybook/preview"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import {
  createPracticeViewArgs,
  getVisiblePracticeEndDialog,
  withReferenceAnswer,
} from "./practice-story-fixtures"
import { PracticeView } from "../PracticeView"

const meta = preview.meta({
  component: PracticeView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/practice"] } },
  title: "Pages/Practice/Review",
})

export const Evaluating = meta.story({
  args: createPracticeViewArgs("evaluatingAnswer"),
})

export const EvaluationError = meta.story({
  args: { ...createPracticeViewArgs("evaluatingAnswer"), evaluationError: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-evaluation-error")).toBeVisible()
    await expect(canvas.queryByText(/unsafe|stack|exception/i)).not.toBeInTheDocument()
  },
})

export const BalancedReview = meta.story({
  args: createPracticeViewArgs("reviewBalanced"),
})

export const ReviewFlaggedQuestion = meta.story({
  args: createFlaggedReviewArgs(),
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

export const ReviewWithPersonalizedExample = meta.story({
  args: withReferenceAnswer("reviewBalanced", "projectDeepDive", 1, false),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /展开参考答案|expand reference/i }))
    await expect(canvas.getByText(/我会选用推荐材料中的/)).toBeVisible()
  },
})

export const ReviewWithTechnicalReference = meta.story({
  args: withReferenceAnswer("reviewBalanced", "technicalFoundation", 1, false),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/技术参考答案|technical reference answer/i)).toBeVisible()
  },
})

export const ReviewWithReactReference = meta.story({
  args: withReferenceAnswer("reviewBalanced", "technicalFoundation", 1, false),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /展开参考答案|expand reference/i }))
    await expect(canvas.getByText(/React 重复渲染首先要区分/)).toBeVisible()
  },
})

export const ReviewWithRequestLayerReference = meta.story({
  args: withReferenceAnswer("reviewBalanced", "technicalFoundation", 2, false),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /展开参考答案|expand reference/i }))
    await expect(canvas.getByText(/长期演进的数据请求层/)).toBeVisible()
    await expect(canvas.queryByText(/React 重复渲染首先要区分/)).not.toBeInTheDocument()
  },
})

export const ReviewAssistedAttempt = meta.story({
  args: withReferenceAnswer("reviewBalanced", "projectDeepDive", 1, true),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/作答前已查看|viewed before submission/i)).toBeVisible()
  },
})

export const HighScoreReview = meta.story({
  args: createPracticeViewArgs("reviewHighScore"),
})

export const LowScoreReview = meta.story({
  args: createPracticeViewArgs("reviewLowScore"),
})

export const RetryRecommended = meta.story({
  args: createPracticeViewArgs("reviewRetryRecommended"),
})

export const NextQuestionRecommended = meta.story({
  args: createPracticeViewArgs("reviewNextRecommended"),
})

export const ReviewActionPending = meta.story({
  args: {
    ...createPracticeViewArgs("reviewBalanced"),
    reviewPending: {
      ...createPracticeViewArgs("reviewBalanced").reviewPending,
      interactionLocked: true,
      retry: true,
    },
  },
  play: async ({ canvas }) => {
    for (const name of [
      /重练当前题|retry current question/i,
      /继续下一题|next question/i,
      /结束本轮练习|end this session/i,
      /收藏题目|save question/i,
      /标记为薄弱题|mark as weak/i,
    ]) {
      await expect(canvas.getByRole("button", { name })).toBeDisabled()
    }
    await expect(
      canvas
        .getByRole("button", { name: /重练当前题|retry current question/i })
        .querySelector('[data-slot="spinner"]'),
    ).toBeVisible()
  },
})

const reviewRetryErrorAction = fn(async () => {
  throw new Error("internal")
})

export const ReviewRetryError = meta.story({
  args: {
    ...createPracticeViewArgs("reviewBalanced"),
    reviewActions: {
      ...createPracticeViewArgs("reviewBalanced").reviewActions,
      onRetryCurrent: reviewRetryErrorAction,
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /重练当前题|retry current question/i }),
    )
    await expect(reviewRetryErrorAction).toHaveBeenCalledTimes(1)
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(canvas.getByRole("alert")).not.toHaveTextContent("internal")
  },
})

const reviewNextErrorAction = fn(async () => {
  throw new Error("internal")
})

export const ReviewNextError = meta.story({
  args: {
    ...createPracticeViewArgs("reviewBalanced"),
    reviewActions: {
      ...createPracticeViewArgs("reviewBalanced").reviewActions,
      onNextQuestion: reviewNextErrorAction,
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /继续下一题|next question/i }))
    await expect(reviewNextErrorAction).toHaveBeenCalledTimes(1)
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(canvas.getByRole("alert")).not.toHaveTextContent("internal")
  },
})

const reviewEndErrorAction = fn(async () => {
  if (reviewEndErrorAction.mock.calls.length === 1) {
    throw new Error("sessionId=private version=17")
  }
  return "executed" as const
})

export const ReviewEndError = meta.story({
  args: {
    ...createPracticeViewArgs("reviewBalanced"),
    reviewActions: {
      ...createPracticeViewArgs("reviewBalanced").reviewActions,
      onEndSession: reviewEndErrorAction,
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /结束本轮练习|end this session/i }))
    const dialog = await getVisiblePracticeEndDialog()
    await expect(
      within(dialog).getByRole("heading", { name: /结束本轮专项练习|end this targeted-practice/i }),
    ).toBeInTheDocument()
    await userEvent.click(
      within(dialog).getByRole("button", { name: /结束本轮练习|end this session/i }),
    )
    await expect(reviewEndErrorAction).toHaveBeenCalledTimes(1)
    await expect(dialog).toBeVisible()
    await expect(within(dialog).getByRole("alert")).toBeVisible()
    await expect(within(dialog).getByRole("alert")).not.toHaveTextContent(
      /sessionId|private|version=17/i,
    )
    await userEvent.click(
      within(dialog).getByRole("button", { name: /结束本轮练习|end this session/i }),
    )
    await expect(reviewEndErrorAction).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(dialog).not.toBeVisible())
  },
})

export const ReviewMobileFixedActions = meta.story({
  args: createPracticeViewArgs("reviewBalanced"),
  globals: { viewport: { isRotated: false, value: "mobile1" } },
  play: async ({ canvas }) => {
    const actionBar = canvas.getByTestId("practice-review-actions-bar")
    await expect(actionBar).toBeVisible()
    await expect(canvas.getByTestId("practice-review-actions")).toHaveClass(
      "grid-cols-1",
      "min-[360px]:grid-cols-2",
      "sm:flex",
    )
  },
})

const endSessionConfirmationAction = fn(async () => "executed" as const)

export const EndSessionConfirmation = meta.story({
  args: {
    ...createPracticeViewArgs("reviewBalanced"),
    reviewActions: {
      ...createPracticeViewArgs("reviewBalanced").reviewActions,
      onEndSession: endSessionConfirmationAction,
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /结束本轮练习|end this session/i }))
    await expect(endSessionConfirmationAction).not.toHaveBeenCalled()
    const firstDialog = await getVisiblePracticeEndDialog()
    await expect(
      within(firstDialog).getByRole("heading", {
        name: /结束本轮专项练习|end this targeted-practice/i,
      }),
    ).toBeInTheDocument()
    await userEvent.click(
      within(firstDialog).getByRole("button", { name: /继续回答|keep answering/i }),
    )
    await waitFor(() => expect(firstDialog).not.toBeVisible())
    await userEvent.click(canvas.getByRole("button", { name: /结束本轮练习|end this session/i }))
    const secondDialog = await getVisiblePracticeEndDialog()
    await userEvent.click(
      within(secondDialog).getByRole("button", { name: /结束本轮练习|end this session/i }),
    )
    await expect(endSessionConfirmationAction).toHaveBeenCalledTimes(1)
  },
})

export const LongReviewContent = meta.story({
  args: createPracticeViewArgs("reviewLongContent"),
})

function createFlaggedReviewArgs() {
  const args = createPracticeViewArgs("reviewBalanced")
  const response = structuredClone(args.content.data)
  if (response.session.status !== "review") throw new Error("Review fixture required.")
  response.session.question.isSaved = true
  response.session.question.isMarkedWeak = true
  return { ...args, content: { data: response, status: "ready" as const } }
}

export const NoNewWeaknesses = meta.story({
  args: createPracticeViewArgs("reviewNoNewWeaknesses"),
})

export const MotivationReview = meta.story({
  args: createPracticeViewArgs("reviewMotivation"),
})

export const FollowUpEndedEarlyReview = meta.story({
  args: createPracticeViewArgs("reviewFollowUpEndedEarly"),
})

export const FollowUpReviewWithReferences = meta.story({
  args: createPracticeViewArgs("reviewBalanced"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-follow-up-review")).toBeVisible()
    await expect(
      canvas.getAllByRole("button", { name: /展开 RIVA|expand RIVA/i }),
    ).not.toHaveLength(0)
  },
})

export const FollowUpReviewWithUnansweredReference = meta.story({
  args: createPracticeViewArgs("reviewFollowUpEndedEarly"),
  play: async ({ canvas, userEvent }) => {
    const review = canvas.getByTestId("practice-follow-up-review")
    const buttons = within(review).getAllByRole("button", { name: /展开 RIVA|expand RIVA/i })
    await userEvent.click(buttons.at(-1)!)
    await expect(within(review).getByText(/未回答|Unanswered/i)).toBeVisible()
  },
})

export const FollowUpEndedEarly = meta.story({
  args: createPracticeViewArgs("evaluatingFollowUpEndedEarly"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-evaluating-state")).toBeVisible()
    await expect(canvas.getByTestId("practice-follow-up-incomplete")).toBeVisible()
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
  },
})

export const NoFollowUpRequired = meta.story({
  args: createPracticeViewArgs("evaluatingNoFollowUp"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-evaluating-state")).toBeVisible()
    await expect(canvas.queryByText(/追问 1|Follow-up 1/i)).not.toBeInTheDocument()
  },
})
