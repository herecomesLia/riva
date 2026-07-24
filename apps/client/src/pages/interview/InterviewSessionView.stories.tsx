import preview from "#storybook/preview"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import { createInterviewAgentPlanMock } from "@/mocks/data/interview"
import type { InterviewConversationRecordViewData } from "@/models/interview"

import { createInterviewSessionStoryFixture } from "./stories/interview-story-fixtures"
import { InterviewSessionView, type InterviewSessionSummary } from "./InterviewSessionView"

const fixture = createInterviewSessionStoryFixture()
const noFollowUpsPlan = createInterviewAgentPlanMock("noFollowUps")
const singleFollowUpPlan = createInterviewAgentPlanMock("singleFollowUp")
const multipleFollowUpsPlan = createInterviewAgentPlanMock("multipleFollowUps")
const lastQuestionFollowUpPlan = createInterviewAgentPlanMock("lastQuestionFollowUp")
const unknownTotalPlan = createInterviewAgentPlanMock("unknownTotal")
const adjustedPlan = createInterviewAgentPlanMock("adjustedPlan")

const projectQuestion = multipleFollowUpsPlan.questions[1]!
const firstFollowUp = projectQuestion.followUps[0]!
const secondFollowUp = projectQuestion.followUps[1]!
const answer = "我先定位关键链路，再协调上下游分阶段灰度，并持续观察性能与业务指标。"

function summary(
  completedMainQuestions: number,
  totalMainQuestions: number | null,
  planRevision = 1,
): InterviewSessionSummary {
  return {
    ...fixture.summary,
    completedMainQuestions,
    totalMainQuestions,
    planRevision,
  }
}

function record(
  id: string,
  kind: "question" | "followUp",
  questionOrder: number,
  prompt: string,
): InterviewConversationRecordViewData {
  return { id, kind, questionOrder, prompt, answer }
}

const activeActions = {
  isEnding: false,
  isInteractionLocked: false,
  onEnd: fn(async () => undefined),
}

const questionArgs = {
  ...activeActions,
  status: "question",
  summary: summary(1, multipleFollowUpsPlan.initialProgress.totalMainQuestions),
  prompt: {
    id: projectQuestion.question.id,
    kind: "question",
    content: projectQuestion.question.prompt,
    questionOrder: projectQuestion.question.order,
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
  args: {
    ...activeActions,
    status: "opening",
    summary: summary(0, singleFollowUpPlan.initialProgress.totalMainQuestions),
    openingMessage: fixture.openingMessage,
    isBeginning: false,
    beginFailed: false,
    onBegin: fn(async () => undefined),
  },
})

export const TwoQuestionsWithoutFollowUps = meta.story({
  args: {
    ...questionArgs,
    summary: summary(0, noFollowUpsPlan.initialProgress.totalMainQuestions),
    prompt: {
      id: noFollowUpsPlan.questions[0]!.question.id,
      kind: "question",
      content: noFollowUpsPlan.questions[0]!.question.prompt,
      questionOrder: noFollowUpsPlan.questions[0]!.question.order,
    },
  },
})

export const SingleFollowUp = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      id: singleFollowUpPlan.questions[1]!.followUps[0]!.id,
      kind: "followUp",
      content: singleFollowUpPlan.questions[1]!.followUps[0]!.prompt,
      questionOrder: singleFollowUpPlan.questions[1]!.question.order,
    },
    history: [
      record(
        singleFollowUpPlan.questions[1]!.question.id,
        "question",
        singleFollowUpPlan.questions[1]!.question.order,
        singleFollowUpPlan.questions[1]!.question.prompt,
      ),
    ],
  },
})

export const ConsecutiveFollowUps = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      id: secondFollowUp.id,
      kind: "followUp",
      content: secondFollowUp.prompt,
      questionOrder: projectQuestion.question.order,
    },
    history: [
      record(
        projectQuestion.question.id,
        "question",
        projectQuestion.question.order,
        projectQuestion.question.prompt,
      ),
      record(firstFollowUp.id, "followUp", projectQuestion.question.order, firstFollowUp.prompt),
    ],
  },
})

export const LastQuestionFollowUp = meta.story({
  args: {
    ...questionArgs,
    summary: summary(1, lastQuestionFollowUpPlan.initialProgress.totalMainQuestions),
    prompt: {
      id: lastQuestionFollowUpPlan.questions[1]!.followUps[0]!.id,
      kind: "followUp",
      content: lastQuestionFollowUpPlan.questions[1]!.followUps[0]!.prompt,
      questionOrder: lastQuestionFollowUpPlan.questions[1]!.question.order,
    },
  },
})

export const UnknownTotal = meta.story({
  args: {
    ...questionArgs,
    summary: summary(1, unknownTotalPlan.initialProgress.totalMainQuestions),
  },
})

export const AdjustedPlan = meta.story({
  args: {
    ...questionArgs,
    summary: summary(
      1,
      adjustedPlan.planChanges[0]!.totalMainQuestions,
      adjustedPlan.planChanges[0]!.planRevision,
    ),
  },
})

export const LongContentNarrow = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      ...questionArgs.prompt,
      id: "long-question",
      content: `${projectQuestion.question.prompt} 请进一步说明在不能中断业务迭代、需要协调多个上下游团队且缺少完整历史监控数据的约束下，你会如何识别最高风险、规划迁移边界，并用可验证的数据判断治理是否成功？`,
    },
    history: [
      {
        ...record("long-history", "question", 1, "请介绍相关背景。"),
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
    await userEvent.click(within(dialog).getByRole("button", { name: /确认结束|confirm end/i }))
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
