import preview from "#storybook/preview"

import { withRouter } from "#storybook/decorators/with-router"
import { RecommendationCard } from "./RecommendationCard"

const response = {
  runId: "00000000-0000-4000-8000-000000000001",
  status: "succeeded" as const,
  targetRoleId: "00000000-0000-4000-8000-000000000002",
  interactionLanguage: "zh-CN" as const,
  attemptCount: 1,
  maxAttempts: 3,
  errorCode: null,
  failureReason: null,
  createdAt: "2026-08-18T10:00:00.000Z",
  startedAt: "2026-08-18T10:00:00.000Z",
  finishedAt: "2026-08-18T10:00:01.000Z",
  plan: {
    action: "targetedPractice" as const,
    reason: "补强项目结果表达，准备下一轮岗位沟通。",
    focusAreas: ["项目结果表达", "证据具体性"],
    questionType: "projectDeepDive" as const,
    difficulty: "basic" as const,
    prioritizeWeaknesses: true,
  },
}

const meta = preview.meta({
  component: RecommendationCard,
  decorators: [withRouter],
  parameters: {
    router: {
      initialEntries: ["/dashboard"],
    },
  },
  title: "Dashboard/RecommendationCard",
})

export const TargetedPractice = meta.story({
  args: {
    state: { response, status: "succeeded" },
  },
})

export const MockInterview = meta.story({
  args: {
    state: {
      response: {
        ...response,
        plan: {
          action: "mockInterview",
          reason: "综合练习多个能力并检验压力应对。",
          focusAreas: ["风险控制", "压力应对"],
          round: "comprehensive",
          difficulty: "pressure",
          durationMinutes: 30,
        },
      },
      status: "succeeded",
    },
  },
})

export const Loading = meta.story({
  args: {
    state: { status: "loading" },
  },
})

export const Empty = meta.story({
  args: {
    state: { status: "inactive" },
  },
})

export const Failed = meta.story({
  args: {
    state: {
      status: "failed",
      isRetrying: false,
      onRetry: () => undefined,
    },
  },
})
