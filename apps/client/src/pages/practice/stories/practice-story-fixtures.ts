import { expect, fn, screen, waitFor, within } from "storybook/test"

import {
  createGeneratedPracticeQuestion,
  createPracticeMockResponse,
  createPracticeReferenceAnswer,
  getMockQuestionTemplateId,
} from "@/mocks/data/practice"
import type { PracticeReviewState } from "@/models/practice"

export type PracticeReviewStoryVariant =
  | "balanced"
  | "boundaryScore"
  | "emptyDetails"
  | "fewDimensions"
  | "highScore"
  | "longDetails"
  | "longDimensions"
  | "longFocusAreas"
  | "lowScore"
  | "nextRecommendation"
  | "retryRecommendation"

export function createPracticeReviewStoryFixture(
  variant: PracticeReviewStoryVariant = "balanced",
): PracticeReviewState {
  const scenario =
    variant === "highScore"
      ? "reviewHighScore"
      : variant === "lowScore"
        ? "reviewLowScore"
        : variant === "retryRecommendation"
          ? "reviewRetryRecommended"
          : variant === "nextRecommendation" || variant === "longFocusAreas"
            ? "reviewNextRecommended"
            : variant === "longDetails"
              ? "reviewLongContent"
              : "reviewBalanced"
  const response = createPracticeMockResponse(scenario)
  if (response.session.status !== "review") throw new Error("Review fixture required.")
  const session = response.session

  if (variant === "boundaryScore") session.evaluation.overallScore = 60
  if (variant === "fewDimensions") {
    session.evaluation.dimensionScores = session.evaluation.dimensionScores.slice(0, 3)
  }
  if (variant === "longDimensions") {
    session.evaluation.dimensionScores = session.evaluation.dimensionScores.map((score) => ({
      ...score,
      explanation: `${score.explanation} 同时需要结合岗位目标、候选人的个人职责边界、方案取舍依据、跨团队协作过程和最终验证周期，才能完整判断这项能力是否稳定可复用。`,
    }))
  }
  if (variant === "longFocusAreas" && session.review.recommendation.action === "nextQuestion") {
    session.review.recommendation.nextQuestion.focusAreas = [
      "复杂约束下的技术方案比较与取舍依据",
      "跨团队分歧处理、共识建立与持续推进",
      "灰度验证指标、异常告警阈值和回滚条件",
      "长期维护成本、业务收益与用户体验平衡",
    ]
  }
  if (variant === "emptyDetails") {
    session.review.highlights = []
    session.review.mainIssues = []
    session.review.improvementSuggestions = []
    session.review.reusableAnswerStructure = []
    session.review.exposedWeaknesses = []
  }
  if (variant === "longDetails") {
    session.review.highlights = [
      "能够从业务影响、用户反馈和性能数据三个角度界定问题，并清楚说明候选人在问题定位、方案比较、跨团队推动以及结果验证中的个人贡献。",
      "通过实验组与对照组、分设备灰度和持续观察周期建立可信归因，同时说明异常指标出现时的告警、止损和回滚机制。",
    ]
    session.review.mainIssues = [
      "背景信息仍然偏长，关键判断出现较晚，面试官需要在较多上下文中寻找候选人真正负责的决策和推动动作。",
      "虽然提到了风险控制，但仍需进一步说明监控负责人、告警阈值、观察周期以及触发回滚后的协作流程。",
    ]
    session.review.improvementSuggestions = [
      "将回答压缩为目标与约束、个人判断、关键取舍、推动动作、量化验证和复盘沉淀六个连续部分，每一部分优先说明自己的具体贡献。",
      "补充优化前基线、实验组与对照组差异、持续观察周期、异常告警阈值和回滚条件，使收益归因与风险控制形成完整闭环。",
    ]
    session.review.reusableAnswerStructure = [
      "用业务目标、用户影响和明确约束快速界定问题",
      "说明个人负责的分析过程、证据来源和关键判断",
      "比较候选方案并解释收益、成本、风险和长期维护取舍",
      "描述跨团队分歧、沟通动作、共识形成和推进节奏",
      "给出实验设计、指标变化、观察周期和可信归因",
      "补充异常告警、止损条件、回滚方案和复盘沉淀",
    ]
    session.review.exposedWeaknesses = [
      "复杂背景下快速突出个人贡献与关键判断",
      "灰度发布期间的监控、告警、止损与回滚机制",
      "技术收益、业务价值和长期维护成本的综合表达",
    ]
  }

  return session
}

export function createPracticeViewArgs(scenario: Parameters<typeof createPracticeMockResponse>[0]) {
  return {
    answeringActions: {
      onEnd: fn(async () => "executed" as const),
      onRequestFramework: fn(async () => "executed" as const),
      onRequestHint: fn(async () => "executed" as const),
      onRequestReferenceAnswer: fn(async () => "executed" as const),
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
      referenceAnswer: false,
      interactionLocked: false,
      saved: false,
      skip: false,
      submitAnswer: false,
      weak: false,
    },
    followUpActions: {
      onEndFollowUps: fn(async () => "executed" as const),
      onRequestFramework: fn(async () => "executed" as const),
      onRequestHint: fn(async () => "executed" as const),
      onRequestReferenceAnswer: fn(async () => "executed" as const),
      onSubmitFollowUp: fn(async () => "executed" as const),
    },
    followUpPending: {
      end: false,
      framework: false,
      hint: false,
      interactionLocked: false,
      referenceAnswer: false,
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
    isStarting: false,
    onStart: fn(async () => undefined),
    variant: "default" as const,
  }
}

export async function getVisiblePracticeEndDialog() {
  return waitFor(() => {
    const dialog = [...screen.getAllByRole("alertdialog")].reverse().find((candidate) =>
      within(candidate).queryByRole("heading", {
        name: /结束本轮专项练习|end this targeted-practice/i,
      }),
    )

    if (!dialog) {
      throw new Error("Expected an open confirmation dialog.")
    }

    expect(dialog).toBeVisible()

    return dialog
  })
}

export function withReferenceAnswer(
  scenario: "answeringQuestion" | "reviewBalanced",
  questionType: "projectDeepDive" | "technicalFoundation",
  ordinal: 1 | 2,
  viewedBeforeSubmission: boolean,
  origin: "initial" | "retry" | "nextQuestion" = "initial",
) {
  const args = createPracticeViewArgs(scenario)
  const response = structuredClone(args.content.data)
  if (!("question" in response.session)) throw new Error("Question fixture required.")
  response.session.selection.questionType = questionType
  response.session.question = createGeneratedPracticeQuestion({
    sessionId: response.session.sessionId,
    ordinal,
    selection: response.session.selection,
  })
  response.session.question.referenceAnswer = {
    status: "revealed",
    content: createPracticeReferenceAnswer({
      templateId: getMockQuestionTemplateId(response.session.question),
      questionType: response.session.question.questionType,
      targetRoleTitle: "Senior Frontend Engineer",
      questionPrompt: response.session.question.prompt,
      recommendedMaterials: response.session.question.recommendedMaterials,
    }),
    viewedBeforeSubmission,
  }
  if (response.session.status === "answering" && origin !== "initial") {
    const completed = createPracticeMockResponse("completedSession")
    if (completed.session.status !== "completed") throw new Error("Attempt fixture required.")
    const previousAttempt = structuredClone(completed.session.attemptRecords[0])
    if (!previousAttempt) throw new Error("Attempt fixture required.")
    if (origin === "retry") previousAttempt.question = structuredClone(response.session.question)
    response.session.attemptNumber = 2
    response.session.attemptId = `${response.session.sessionId}_attempt_2`
    response.session.attemptRecords = [previousAttempt]
  }
  return { ...args, content: { data: response, status: "ready" as const } }
}
