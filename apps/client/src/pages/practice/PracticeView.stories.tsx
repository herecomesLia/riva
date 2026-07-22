import preview from "#storybook/preview"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import { useRouter, useRouterState } from "@tanstack/react-router"

import { withRouter } from "#storybook/decorators/with-router"
import { createPracticeMockResponse, createPracticeReferenceAnswer } from "@/mocks/data/practice"

import { PracticeView } from "./PracticeView"

const meta = preview.meta({
  component: PracticeView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/practice"] } },
  title: "Pages/Practice/PracticeView",
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
    completedActions: {
      onPrepareNextRound: fn(async () => "executed" as const),
    },
    completedPending: false,
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
    reviewActions: {
      onEndSession: fn(async () => "executed" as const),
      onNextQuestion: fn(async () => "executed" as const),
      onRetryCurrent: fn(async () => "executed" as const),
      onSetSaved: fn(async () => "executed" as const),
      onSetWeak: fn(async () => "executed" as const),
    },
    reviewPending: {
      end: false,
      interactionLocked: false,
      next: false,
      retry: false,
      saved: false,
      weak: false,
    },
    content: { data: createPracticeMockResponse(scenario), status: "ready" as const },
    evaluationError: false,
    generationError: false,
    isEvaluationRetrying: false,
    isGenerationRetrying: false,
    isStarting: false,
    onRetryGeneration: fn(),
    onRetryEvaluation: fn(),
    onStart: fn(async () => undefined),
    variant: "default" as const,
  }
}

async function getVisiblePracticeEndDialog() {
  return waitFor(() => {
    const dialog = [...screen.getAllByRole("alertdialog")].reverse().find((candidate) =>
      within(candidate).queryByRole("heading", {
        name: /结束本轮专项练习|end this targeted-practice/i,
      }),
    )
    if (!dialog) throw new Error("Expected an open confirmation dialog.")
    return dialog
  })
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

export const RetryingCurrentQuestion = meta.story({ args: readyArgs("retryingCurrentQuestion") })

export const GeneratingNextQuestion = meta.story({ args: readyArgs("generatingNextQuestion") })

export const NextQuestionError = meta.story({
  args: { ...readyArgs("generatingNextQuestion"), generationError: true },
})

function CompletedSessionStory() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <>
      <PracticeView {...readyArgs("completedSession")} />
      <output data-testid="practice-story-location">{pathname}</output>
    </>
  )
}

export const CompletedSession = meta.story({
  render: () => <CompletedSessionStory />,
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-completed-state")).toBeVisible()
    await expect(canvas.getByRole("button", { name: /开始下一轮|start next round/i })).toBeEnabled()
    const historyButton = canvas.getByRole("button", {
      name: /查看练习记录|view practice history/i,
    })
    await expect(historyButton).toBeEnabled()
    await userEvent.click(historyButton)
    await expect(canvas.getByTestId("practice-story-location")).toHaveTextContent("/history")
  },
})

export const CompletedStartingNextRound = meta.story({
  args: {
    ...readyArgs("completedSession"),
    completedPending: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /正在准备下一轮|preparing next round/i }),
    ).toBeDisabled()
    await expect(
      canvas.getByTestId("practice-completed-state").querySelector('[data-slot="spinner"]'),
    ).toBeVisible()
    await expect(
      canvas.getByRole("button", { name: /查看练习记录|view practice history/i }),
    ).toHaveAttribute("aria-disabled", "true")
  },
})

const rejectedNextRound = fn(async () => {
  throw new Error("internal next-round error")
})

export const CompletedNextRoundError = meta.story({
  args: {
    ...readyArgs("completedSession"),
    completedActions: { onPrepareNextRound: rejectedNextRound },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /开始下一轮|start next round/i }))
    await expect(rejectedNextRound).toHaveBeenCalledTimes(1)
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(canvas.queryByText(/internal next-round error/i)).not.toBeInTheDocument()
    await expect(canvas.getByTestId("practice-completed-state")).toBeVisible()
  },
})

export const CompletedWithRetries = meta.story({ args: readyArgs("completedWithRetries") })

export const CompletedWithWeakQuestions = meta.story({
  args: readyArgs("completedWithWeakQuestions"),
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

export const AnsweringReferenceAnswerHidden = meta.story({
  args: readyArgs("answeringQuestion"),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /RIVA 示例回答|RIVA example answer/i }),
    ).toBeVisible()
    await expect(canvas.queryByText(/我会选用推荐材料|I would use/i)).not.toBeInTheDocument()
  },
})

function withReferenceAnswer(
  scenario: "answeringQuestion" | "reviewBalanced",
  questionType: "projectDeepDive" | "technicalFoundation",
  viewedBeforeSubmission: boolean,
) {
  const args = readyArgs(scenario)
  const response = structuredClone(args.content.data)
  if (!("question" in response.session)) throw new Error("Question fixture required.")
  response.session.question.questionType = questionType
  response.session.selection.questionType = questionType
  response.session.question.referenceAnswer = {
    status: "revealed",
    content: createPracticeReferenceAnswer(questionType),
    viewedBeforeSubmission,
  }
  return { ...args, content: { data: response, status: "ready" as const } }
}

export const AnsweringReferenceAnswerRevealed = meta.story({
  args: withReferenceAnswer("answeringQuestion", "projectDeepDive", true),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/个性化示例回答|personalized example answer/i)).toBeVisible()
    await expect(canvas.getByText(/我会选用推荐材料中的/)).toBeVisible()
  },
})

export const AnsweringTechnicalReference = meta.story({
  args: withReferenceAnswer("answeringQuestion", "technicalFoundation", true),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/技术参考答案|technical reference answer/i)).toBeVisible()
  },
})

function DraftLeaveProtectionStory() {
  const router = useRouter()

  return (
    <div className="flex flex-col gap-4">
      <PracticeView {...readyArgs("answeringQuestion")} />
      <button onClick={() => void router.navigate({ to: "/profile" })} type="button">
        Leave practice
      </button>
    </div>
  )
}

export const DraftLeaveProtection = meta.story({
  render: () => <DraftLeaveProtectionStory />,
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox"), "未提交的专项练习草稿")
    await userEvent.click(canvas.getByRole("button", { name: "Leave practice" }))
    const dialog = await screen.findByRole("alertdialog")
    await expect(
      within(dialog).getByRole("heading", { name: /离开并放弃回答|leave and discard/i }),
    ).toBeVisible()
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

export const Evaluating = meta.story({
  args: readyArgs("evaluatingAnswer"),
})

export const EvaluationError = meta.story({
  args: { ...readyArgs("evaluatingAnswer"), evaluationError: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-evaluation-error")).toBeVisible()
    await expect(canvas.queryByText(/unsafe|stack|exception/i)).not.toBeInTheDocument()
  },
})

export const BalancedReview = meta.story({
  args: readyArgs("reviewBalanced"),
})

export const ReviewWithPersonalizedExample = meta.story({
  args: withReferenceAnswer("reviewBalanced", "projectDeepDive", false),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /展开参考答案|expand reference/i }))
    await expect(canvas.getByText(/我会选用推荐材料中的/)).toBeVisible()
  },
})

export const ReviewWithTechnicalReference = meta.story({
  args: withReferenceAnswer("reviewBalanced", "technicalFoundation", false),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/技术参考答案|technical reference answer/i)).toBeVisible()
  },
})

export const ReviewAssistedAttempt = meta.story({
  args: withReferenceAnswer("reviewBalanced", "projectDeepDive", true),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/作答前已查看|viewed before submission/i)).toBeVisible()
  },
})

export const HighScoreReview = meta.story({
  args: readyArgs("reviewHighScore"),
})

export const LowScoreReview = meta.story({
  args: readyArgs("reviewLowScore"),
})

export const RetryRecommended = meta.story({
  args: readyArgs("reviewRetryRecommended"),
})

export const NextQuestionRecommended = meta.story({
  args: readyArgs("reviewNextRecommended"),
})

export const ReviewActionPending = meta.story({
  args: {
    ...readyArgs("reviewBalanced"),
    reviewPending: {
      ...readyArgs("reviewBalanced").reviewPending,
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
    ...readyArgs("reviewBalanced"),
    reviewActions: {
      ...readyArgs("reviewBalanced").reviewActions,
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
    ...readyArgs("reviewBalanced"),
    reviewActions: {
      ...readyArgs("reviewBalanced").reviewActions,
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
  throw new Error("internal")
})

export const ReviewEndError = meta.story({
  args: {
    ...readyArgs("reviewBalanced"),
    reviewActions: {
      ...readyArgs("reviewBalanced").reviewActions,
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
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(canvas.getByRole("alert")).not.toHaveTextContent("internal")
  },
})

const endSessionConfirmationAction = fn(async () => "executed" as const)

export const EndSessionConfirmation = meta.story({
  args: {
    ...readyArgs("reviewBalanced"),
    reviewActions: {
      ...readyArgs("reviewBalanced").reviewActions,
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
  args: readyArgs("reviewLongContent"),
})

export const NoNewWeaknesses = meta.story({
  args: readyArgs("reviewNoNewWeaknesses"),
})

export const MotivationReview = meta.story({
  args: readyArgs("reviewMotivation"),
})

export const FollowUpEndedEarlyReview = meta.story({
  args: readyArgs("reviewFollowUpEndedEarly"),
})

export const FollowUpEndedEarly = meta.story({
  args: readyArgs("evaluatingFollowUpEndedEarly"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-evaluating-state")).toBeVisible()
    await expect(canvas.getByTestId("practice-follow-up-incomplete")).toBeVisible()
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
  },
})

export const NoFollowUpRequired = meta.story({
  args: readyArgs("evaluatingNoFollowUp"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-evaluating-state")).toBeVisible()
    await expect(canvas.queryByText(/追问 1|Follow-up 1/i)).not.toBeInTheDocument()
  },
})
