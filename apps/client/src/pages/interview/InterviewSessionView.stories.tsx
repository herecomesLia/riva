import preview from "#storybook/preview"
import { expect, fn, screen, within } from "storybook/test"

import { createInterviewSessionStoryFixture } from "./stories/interview-story-fixtures"
import { InterviewSessionView } from "./InterviewSessionView"

const fixture = createInterviewSessionStoryFixture()
const projectQuestion = fixture.completedQuestions.find(
  ({ question }) => question.id === "interview-question-project-deep-dive",
)
const motivationQuestion = fixture.completedQuestions.find(
  ({ question }) => question.id === "interview-question-motivation",
)
const projectFollowUp = projectQuestion?.followUps[0]
if (
  projectQuestion === undefined ||
  projectFollowUp === undefined ||
  motivationQuestion === undefined
) {
  throw new Error("Complete interview question fixtures required.")
}

const activeActions = {
  isEnding: false,
  isInteractionLocked: false,
  onEnd: fn(async () => undefined),
}

const questionArgs = {
  ...activeActions,
  status: "question",
  summary: fixture.summary,
  prompt: {
    id: projectQuestion.question.id,
    kind: "question",
    content: projectQuestion.question.prompt,
    questionOrder: projectQuestion.question.order,
    answer: null,
  },
  history: fixture.history.filter(({ id }) => id === "interview-question-self-introduction"),
  isSubmitting: false,
  advanceStatus: "idle",
  onSubmit: fn(async () => undefined),
  onRetryAdvance: fn(),
} as const

const meta = preview.meta({
  component: InterviewSessionView,
  title: "Pages/Interview/Session",
})

export const Loading = meta.story({
  args: { status: "loading" },
})

export const Opening = meta.story({
  args: {
    ...activeActions,
    status: "opening",
    summary: { ...fixture.summary, completedQuestions: 0 },
    openingMessage: fixture.openingMessage,
    isBeginning: false,
    beginFailed: false,
    onBegin: fn(async () => undefined),
  },
})

export const Question = meta.story({
  args: questionArgs,
})

export const LongContentNarrow = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      ...questionArgs.prompt,
      id: "long-question",
      content: `${projectQuestion.question.prompt} 请进一步说明在不能中断业务迭代、需要协调多个上下游团队且缺少完整历史监控数据的约束下，你会如何识别最高风险、规划迁移边界，并用可验证的数据判断治理是否成功？`,
    },
    history: questionArgs.history.map((record) => ({
      ...record,
      answer: `${record.answer}\n\n在推进过程中，我还负责组织产品、服务端和质量团队统一指标口径，按风险拆分灰度批次，并持续记录异常、决策依据和回滚条件，确保长周期治理不会影响现有业务交付。`,
    })),
  },
  globals: { viewport: { isRotated: false, value: "mobile1" } },
})

export const SubmittingAnswer = meta.story({
  args: {
    ...questionArgs,
    isSubmitting: true,
    isInteractionLocked: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /正在提交并准备下一问|submitting and preparing/i }),
    ).toBeDisabled()
    await expect(canvas.getByRole("textbox")).toBeDisabled()
  },
})

const submitAnswer = fn(async () => undefined)

export const SubmitAnswer = meta.story({
  args: {
    ...questionArgs,
    onSubmit: submitAnswer,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox"), projectQuestion.answer.content)
    await userEvent.click(canvas.getByRole("button", { name: /提交回答|submit answer/i }))
    await expect(submitAnswer).toHaveBeenCalledWith(projectQuestion.answer.content)
  },
})

export const AnswerSubmissionFailure = meta.story({
  args: {
    ...questionArgs,
    onSubmit: fn(async () => {
      throw new Error("submit failed")
    }),
  },
  play: async ({ canvas, userEvent }) => {
    const answer = projectQuestion.answer.content
    await userEvent.type(canvas.getByRole("textbox"), answer)
    await userEvent.click(canvas.getByRole("button", { name: /提交回答|submit answer/i }))
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(canvas.getByRole("textbox")).toHaveValue(answer)
  },
})

export const Advancing = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      ...questionArgs.prompt,
      answer: projectQuestion.answer.content,
    },
    advanceStatus: "advancing",
  },
})

const retryAdvance = fn()

export const AdvanceFailure = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      ...questionArgs.prompt,
      answer: projectQuestion.answer.content,
    },
    advanceStatus: "failed",
    onRetryAdvance: retryAdvance,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /重新获取下一问|retry next question/i }),
    )
    await expect(retryAdvance).toHaveBeenCalledTimes(1)
  },
})

export const DynamicFollowUp = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      id: projectFollowUp.question.id,
      kind: "followUp",
      content: projectFollowUp.question.prompt,
      questionOrder: projectQuestion.question.order,
      answer: null,
    },
    history: [
      {
        id: projectQuestion.question.id,
        kind: "question",
        questionOrder: projectQuestion.question.order,
        prompt: projectQuestion.question.prompt,
        answer: projectQuestion.answer.content,
      },
    ],
  },
})

const endInterview = fn(async () => undefined)

export const EndConfirmation = meta.story({
  args: {
    ...questionArgs,
    onEnd: endInterview,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /结束面试|end interview/i }))
    const dialog = await screen.findByRole("alertdialog")
    await expect(dialog).toBeVisible()
    await userEvent.click(within(dialog).getByRole("button", { name: /确认结束|confirm end/i }))
    await expect(endInterview).toHaveBeenCalledTimes(1)
  },
})

export const CandidateQuestions = meta.story({
  args: {
    status: "candidateQuestions",
    summary: {
      ...fixture.summary,
      completedQuestions: fixture.summary.totalQuestions,
    },
    prompt: fixture.candidatePrompt,
    history: fixture.history.filter(({ id }) => id === motivationQuestion.question.id),
    exchanges: [fixture.candidateExchange],
    isSubmittingQuestion: false,
    isFinishing: false,
    isInteractionLocked: false,
    onSubmitQuestion: fn(async () => undefined),
    onFinish: fn(async () => undefined),
  },
})

export const MissingSession = meta.story({
  args: {
    status: "unavailable",
    reason: "missing",
    onBack: fn(),
  },
})

const retrySession = fn()

export const LoadError = meta.story({
  args: {
    status: "error",
    isRetrying: false,
    onRetry: retrySession,
    onBack: fn(),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /重试|retry/i }))
    await expect(retrySession).toHaveBeenCalledTimes(1)
  },
})
