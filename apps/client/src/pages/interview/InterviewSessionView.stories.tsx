import preview from "#storybook/preview"
import { expect, fn, screen, waitFor, within } from "storybook/test"
import { interviewFixture } from "@/mocks/fixtures/interview"
import type { InterviewConversationItem } from "@/models/interview-workflow"

import { createInterviewSessionStoryFixture } from "./stories/interview-story-fixtures"
import { InterviewSessionView, type InterviewSessionSummary } from "./InterviewSessionView"

const fixture = createInterviewSessionStoryFixture()
const projectQuestion = { ...interviewFixture.question, questionOrder: 2 }
const firstFollowUp = interviewFixture.followUp
const secondFollowUp = { ...firstFollowUp, content: "如果结果不符合预期，你会如何调整行动？" }
const answer = "我先定位关键链路，再协调上下游分阶段灰度，并持续观察性能与业务指标。"

function summary(
  completedMainQuestions: number,
  totalMainQuestions: number | null,
  planAdjusted = false,
): InterviewSessionSummary {
  return {
    ...fixture.summary,
    completedMainQuestions,
    totalMainQuestions,
    planAdjusted,
  }
}

function record(
  kind: "question" | "followUp",
  questionOrder: number,
  prompt: string,
): InterviewConversationItem {
  return { kind, questionOrder, prompt, answer }
}

const activeActions = {
  isEnding: false,
  isInteractionLocked: false,
  onEnd: fn(async () => undefined),
}

const openingArgs = {
  ...activeActions,
  status: "opening",
  summary: summary(0, 2),
  openingMessage: fixture.openingMessage,
  isBeginning: false,
  beginFailed: false,
  onBegin: fn(async () => undefined),
} as const

const questionArgs = {
  ...activeActions,
  status: "question",
  summary: summary(1, 2),
  prompt: {
    kind: "question",
    content: projectQuestion.content,
    questionOrder: projectQuestion.questionOrder,
  },
  history: [],
  isSubmitting: false,
  onSubmit: fn(async () => undefined),
} as const

const meta = preview.meta({
  component: InterviewSessionView,
  title: "Pages/Interview/Session",
})

export const Loading = meta.story({
  args: { status: "loading" },
})

export const Opening = meta.story({
  args: openingArgs,
})

export const OpeningInteractionLocked = meta.story({
  args: {
    ...openingArgs,
    isEnding: true,
    isInteractionLocked: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /开始正式问答|start questions/i }),
    ).toBeDisabled()
    await expect(canvas.getByRole("button", { name: /结束面试|end interview/i })).toBeDisabled()
    await expect(
      canvas.queryByRole("button", { name: /正在进入问答|starting questions/i }),
    ).not.toBeInTheDocument()
  },
})

export const TwoQuestionsWithoutFollowUps = meta.story({
  args: {
    ...questionArgs,
    summary: summary(0, 2),
    prompt: {
      kind: "question",
      content: interviewFixture.question.content,
      questionOrder: 1,
    },
  },
})

export const SingleFollowUp = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      kind: "followUp",
      content: firstFollowUp.content,
      questionOrder: 2,
    },
    history: [record("question", 2, projectQuestion.content)],
  },
})

export const ConsecutiveFollowUps = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      kind: "followUp",
      content: secondFollowUp.content,
      questionOrder: projectQuestion.questionOrder,
    },
    history: [
      record("question", projectQuestion.questionOrder, projectQuestion.content),
      record("followUp", projectQuestion.questionOrder, firstFollowUp.content),
    ],
  },
})

export const LastQuestionFollowUp = meta.story({
  args: {
    ...questionArgs,
    summary: summary(1, 2),
    prompt: {
      kind: "followUp",
      content: firstFollowUp.content,
      questionOrder: 2,
    },
  },
})

export const UnknownTotal = meta.story({
  args: {
    ...questionArgs,
    summary: summary(1, null),
  },
})

export const AdjustedPlan = meta.story({
  args: {
    ...questionArgs,
    summary: summary(1, 3, true),
  },
})

export const LongContentNarrow = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      ...questionArgs.prompt,
      content: `${projectQuestion.content} 请进一步说明在不能中断业务迭代、需要协调多个上下游团队且缺少完整历史监控数据的约束下，你会如何识别最高风险、规划迁移边界，并用可验证的数据判断治理是否成功？`,
    },
    history: [
      {
        ...record("question", 1, "请介绍相关背景。"),
        answer: answer.repeat(8),
      },
    ],
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
    await userEvent.type(canvas.getByRole("textbox"), answer)
    await userEvent.click(canvas.getByRole("button", { name: /提交回答|submit answer/i }))
    await expect(submitAnswer).toHaveBeenCalledWith(answer)
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
    await userEvent.type(canvas.getByRole("textbox"), answer)
    await userEvent.click(canvas.getByRole("button", { name: /提交回答|submit answer/i }))
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(canvas.getByRole("textbox")).toHaveValue(answer)
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
    await waitFor(() => expect(dialog).toBeVisible())
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: /结束并查看复盘|end and view review/i,
      }),
    )
    await expect(endInterview).toHaveBeenCalledTimes(1)
  },
})

export const CandidateQuestions = meta.story({
  args: {
    status: "candidateQuestions",
    summary: fixture.summary,
    prompt: fixture.candidatePrompt,
    history: fixture.history,
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

const openCompletedReview = fn()

export const CompletedSession = meta.story({
  args: {
    status: "unavailable",
    reason: "completed",
    onBack: openCompletedReview,
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText(/本次面试已经完成|interview is complete/i)).toBeVisible()
    await userEvent.click(
      canvas.getByRole("button", { name: /前往面试复盘|go to interview review/i }),
    )
    await expect(openCompletedReview).toHaveBeenCalledTimes(1)
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
