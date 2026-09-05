import { practiceFixture } from "@/mocks/fixtures/practice"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"
import type { ReviewSession, PracticeReferenceAnswer } from "@/models/practice-workflow"

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
): ReviewSession {
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
  const response = createPracticeScenario(scenario)
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

export function createPracticeViewArgs(scenario: Parameters<typeof createPracticeScenario>[0]) {
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
    content: { data: createPracticeScenario(scenario), status: "ready" as const },
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

const referenceExamples = {
  personalized: {
    kind: "personalizedExample",
    answer:
      "我会选用推荐材料中的“全球电商结算页性能优化项目”来回答。项目目标是改善结算页在中低端设备上的交互体验，我负责定位前端瓶颈并推动方案落地。我先按设备与网络条件拆分性能数据，结合性能监控和调用链确认主要耗时来自首屏包体与非关键请求竞争。评估整包重构和渐进优化后，我选择先拆分非关键模块、调整请求优先级，并与产品和服务端共同确定灰度范围。上线时按设备分层观察 P75 可交互时间、退出率和异常率，用灰度组与对照组验证变化；结果以项目已有监控数据为准。复盘时我会补充说明方案的适用边界、回滚信号，以及后续如何把一次优化沉淀成持续监控机制。",
    keyPoints: [
      "界定个人职责与业务目标",
      "用分层数据定位瓶颈并解释取舍",
      "通过灰度对照和监控验证结果",
    ],
    commonMistakes: ["只罗列团队动作，没有说明个人判断", "编造项目中不存在的指标或成果"],
  },
  react: {
    kind: "technicalReference",
    answer:
      "React 重复渲染首先要区分“组件函数再次执行”和“浏览器产生多余绘制”。常见原因包括父组件更新向下传播、Context value 或对象/函数引用不稳定、订阅粒度过粗，以及 effect 更新状态形成额外渲染；开发环境下 Strict Mode 的重复调用也不能直接当作生产问题。排查时先用 React DevTools Profiler 记录交互，确认触发源、提交次数和耗时，再检查 props 引用、Context 更新与 effect 依赖。优化应从缩小状态与订阅范围开始，只有在渲染成本确实较高且输入可稳定时再使用 memo、useMemo 或 useCallback，因为缓存本身有复杂度和比较成本。边界上要避免为消除所有函数执行而牺牲正确性，也要分别验证开发与生产构建。最终用相同场景下的 Profiler commit、交互耗时和浏览器性能数据对比，并通过功能测试确认没有引入陈旧闭包或状态不同步。",
    keyPoints: [
      "区分 React 渲染、提交与浏览器绘制",
      "用 Profiler 定位更新来源和真实成本",
      "优先缩小状态范围，再权衡记忆化",
      "在生产构建与一致场景中验证",
    ],
    commonMistakes: [
      "把 Strict Mode 开发期行为直接判定为线上缺陷",
      "无差别添加 memo 和 useCallback",
      "只看渲染次数，不验证交互耗时与正确性",
    ],
  },
  requestLayer: {
    kind: "technicalReference",
    answer:
      "长期演进的数据请求层应先建立端到端类型安全：以服务契约或 schema 生成请求参数、响应和错误类型，在运行时对不可信响应做校验，避免只靠 TypeScript 断言。缓存 key 必须由资源身份和所有影响结果的参数稳定组成；失效策略按数据新鲜度选择主动失效、基于时间的过期或服务端事件同步，并明确 mutation 后如何更新或失效相关查询。并发方面要处理请求去重、取消、乱序响应和乐观更新回滚，用请求版本或库提供的 mutation 上下文防止旧响应覆盖新状态。错误应区分网络、认证、限流、业务校验和未知服务错误，由请求层标准化，再由页面错误边界决定局部提示或整体恢复。重试只用于幂等且可能瞬时恢复的错误，采用有限次数与退避，不能重试业务错误或无幂等保障的写操作。状态一致性上明确服务端状态与本地草稿的所有权，避免多份缓存成为事实来源。接口通过传入 transport、时钟等依赖保持可测试，并用契约测试、竞态测试和缓存失效测试验证。方案取舍上，通用封装应覆盖稳定的横切能力，业务策略留在领域层，避免把请求层做成无法演进的万能抽象。",
    keyPoints: [
      "请求与响应契约、运行时校验和端到端类型安全",
      "稳定缓存 key、失效策略与 mutation 后一致性",
      "请求去重、取消、乱序响应和竞态控制",
      "错误分类、错误边界与幂等重试策略",
      "依赖注入、契约测试和长期演进取舍",
    ],
    commonMistakes: [
      "只声明 TypeScript 类型却不校验真实响应",
      "缓存 key 遗漏参数或 mutation 后全量清空缓存",
      "所有错误统一无限重试",
      "旧请求响应覆盖较新的用户状态",
    ],
  },
} satisfies Record<string, PracticeReferenceAnswer>

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
  response.session.question = structuredClone(practiceFixture.question)
  response.session.question.referenceAnswer = {
    status: "revealed",
    content: structuredClone(
      questionType === "technicalFoundation"
        ? ordinal === 1
          ? referenceExamples.react
          : referenceExamples.requestLayer
        : referenceExamples.personalized,
    ),
    viewedBeforeSubmission,
  }
  if (response.session.status === "answering") response.session.assistedRetry = origin === "retry"
  return { ...args, content: { data: response, status: "ready" as const } }
}
