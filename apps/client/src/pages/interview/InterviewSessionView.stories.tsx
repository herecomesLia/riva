import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { createCandidateQuestionExchange } from "@/mocks/data/interview"

import { InterviewSessionView } from "./InterviewSessionView"

const summary = {
  targetRole: "高级前端工程师",
  company: "字节跳动",
  round: "technical",
  difficulty: "pressure",
  completedQuestions: 1,
  totalQuestions: 3,
} as const

const activeActions = {
  isEnding: false,
  isInteractionLocked: false,
  onEnd: fn(async () => undefined),
}

const questionArgs = {
  ...activeActions,
  status: "question",
  summary,
  prompt: {
    id: "interview-question-2",
    kind: "question",
    content:
      "请介绍一个你主导解决的复杂性能问题。你当时如何定位根因、协调相关团队，并验证优化确实带来了业务结果？",
    questionOrder: 2,
    answer: null,
  },
  history: [],
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
    summary: { ...summary, completedQuestions: 0 },
    openingMessage:
      "你好，我是本次模拟面试的面试官。接下来会围绕岗位经历、项目能力和求职动机连续提问，请尽量像正式面试一样作答。",
    isBeginning: false,
    beginFailed: false,
    onBegin: fn(async () => undefined),
  },
})

export const Question = meta.story({
  args: questionArgs,
})

export const LongContent = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      ...questionArgs.prompt,
      id: "long-question",
      content:
        "假设你接手了一个历史包袱较重、横跨多个业务团队并且每天承载大量交易的前端系统。在不能中断现有业务迭代的前提下，请完整说明你会如何识别最高风险、建立可观测性、规划迁移边界、协调上下游，并用可验证的数据判断这次治理是否成功。",
    },
  },
  globals: { viewport: { isRotated: false, value: "mobile1" } },
})

export const Advancing = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      ...questionArgs.prompt,
      answer:
        "我先通过真实用户监控和链路追踪定位长任务，再拆分高风险步骤，最后用灰度分组对比核心转化指标。",
    },
    advanceStatus: "advancing",
  },
})

export const AdvanceFailure = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      ...questionArgs.prompt,
      answer:
        "我先通过真实用户监控和链路追踪定位长任务，再拆分高风险步骤，最后用灰度分组对比核心转化指标。",
    },
    advanceStatus: "failed",
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /重新获取下一问|retry next question/i }),
    ).toBeVisible()
  },
})

export const DynamicFollowUp = meta.story({
  args: {
    ...questionArgs,
    prompt: {
      id: "interview-follow-up-project-tradeoff",
      kind: "followUp",
      content: "如果监控数据只能证明性能改善，却无法直接证明业务收益，你会如何补充验证？",
      questionOrder: 2,
      answer: null,
    },
    history: [
      {
        id: "interview-question-project-deep-dive",
        kind: "question",
        questionOrder: 2,
        prompt: "请介绍一次你主导的前端性能优化。",
        answer: "我先通过真实用户监控定位长任务，再分阶段实施拆包和渲染调度优化。",
      },
    ],
  },
})

export const CandidateQuestions = meta.story({
  args: {
    status: "candidateQuestions",
    summary: { ...summary, completedQuestions: 3 },
    prompt: "正式提问已经结束。现在请你以候选人身份向面试官提问。",
    history: [
      {
        id: "interview-question-motivation",
        kind: "question",
        questionOrder: 3,
        prompt: "为什么选择这个岗位？",
        answer: "岗位的业务复杂度和技术挑战与我的经验高度匹配。",
      },
    ],
    exchanges: [
      createCandidateQuestionExchange("这个岗位入职后的核心目标和主要协作团队分别是什么？", 1),
    ],
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

export const LoadError = meta.story({
  args: {
    status: "error",
    isRetrying: false,
    onRetry: fn(),
    onBack: fn(),
  },
})
