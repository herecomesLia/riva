import type {
  ActivePracticeSelection,
  AnsweredPracticeFollowUpExchange,
  PracticeAnswer,
  PracticeAttemptRecord,
  PracticeDimensionScore,
  PracticeEvaluation,
  PracticeQuestionCard,
  PracticeReview,
  PracticeSetupContext,
} from "@/models/practice"
import { derivePracticeSupportedQuestionTypes } from "@/models/practice-role-support"
import { createRolesMockResponse } from "@/mocks/data/roles"

import { createPracticeFollowUpQuestion } from "./follow-up-catalog"
import {
  createGeneratedPracticeQuestion,
  createGeneratedPracticeQuestionGuidance,
} from "./question-builders"

export const rolesFixture = createRolesMockResponse("multipleRoles")
export const targetRoles = rolesFixture.roles
  .filter((role) => role.preparationStatus !== "archived")
  .map((role) => ({
    id: role.id,
    title: role.title,
    company: role.company,
    supportedQuestionTypes: derivePracticeSupportedQuestionTypes(role),
  })) satisfies PracticeSetupContext["targetRoles"]

export const setupContext = {
  availability: { status: "available" },
  targetRoles,
  defaultTargetRoleId: rolesFixture.currentRoleId,
  availableDifficulties: ["basic", "pressure"],
  canPrioritizeWeaknesses: true,
  personalizedQuestionGenerationTargetRoleIds: targetRoles.map(({ id }) => id),
  eligibleQuestionCounts: {
    saved: 3,
    history: 5,
  },
  questionSourceAvailability: targetRoles.flatMap((role) =>
    role.supportedQuestionTypes.flatMap((questionType) =>
      (["basic", "pressure"] as const).map((difficulty) => ({
        targetRoleId: role.id,
        questionType,
        difficulty,
        savedQuestionCount: 3,
        historyQuestionCount: 5,
      })),
    ),
  ),
} satisfies PracticeSetupContext

export const defaultSelection = {
  targetRoleId: "role_frontend_bytedance",
  questionType: "projectDeepDive",
  difficulty: "basic",
  source: "personalized",
  prioritizeWeaknesses: false,
} satisfies ActivePracticeSelection

export const activeSession = {
  sessionId: "practice_session_20260720_01",
  language: "zh-CN" as const,
  version: 1,
  selection: defaultSelection,
  startedAt: "2026-07-20T01:30:00.000Z",
  attemptId: "practice_session_20260720_01_attempt_1",
  attemptNumber: 1,
  attemptRecords: [] as PracticeAttemptRecord[],
} as const

export const question = createGeneratedPracticeQuestion({
  sessionId: activeSession.sessionId,
  ordinal: 1,
  selection: defaultSelection,
})

export const behavioralSelection = {
  ...defaultSelection,
  questionType: "behavioral",
} satisfies ActivePracticeSelection

export const behavioralActiveSession = {
  ...activeSession,
  sessionId: "practice_session_behavioral_20260720_01",
  attemptId: "practice_session_behavioral_20260720_01_attempt_1",
  selection: behavioralSelection,
} as const

export const behavioralQuestion = createGeneratedPracticeQuestion({
  sessionId: behavioralActiveSession.sessionId,
  ordinal: 1,
  selection: behavioralSelection,
})

export const motivationSelection = {
  ...defaultSelection,
  questionType: "motivation",
} satisfies ActivePracticeSelection

export const motivationActiveSession = {
  ...activeSession,
  sessionId: "practice_session_motivation_20260720_01",
  attemptId: "practice_session_motivation_20260720_01_attempt_1",
  selection: motivationSelection,
} as const

export const motivationQuestion = createGeneratedPracticeQuestion({
  sessionId: motivationActiveSession.sessionId,
  ordinal: 1,
  selection: motivationSelection,
})

export const defaultGuidance = createGeneratedPracticeQuestionGuidance(question.questionType)

export const hintRevealedQuestion = {
  ...question,
  answerHints: {
    status: "revealed",
    content: defaultGuidance.hints,
  },
} satisfies PracticeQuestionCard

export const frameworkRevealedQuestion = {
  ...question,
  answerFramework: {
    status: "revealed",
    content: defaultGuidance.framework,
  },
} satisfies PracticeQuestionCard

export const savedQuestion = {
  ...question,
  isSaved: true,
} satisfies PracticeQuestionCard

export const weakQuestion = {
  ...question,
  isMarkedWeak: true,
} satisfies PracticeQuestionCard

export const mainAnswer = {
  id: "practice_answer_main_01",
  content:
    "在全球电商结算页项目中，我发现低端设备的可交互时间超过五秒。我负责拆解性能数据，定位到首屏包体和同步请求是主要瓶颈，并推动团队实施路由级拆包、接口并行和关键资源预加载。上线后，P75 可交互时间下降到三秒以内，结算页退出率下降了 8%。",
  createdAt: "2026-07-20T01:35:00.000Z",
  order: 1,
} satisfies PracticeAnswer

export const behavioralMainAnswer = {
  id: "practice_answer_behavioral_main_01",
  content:
    "在一次跨团队发布中，业务方希望按原计划全量上线，但监控显示核心链路仍有风险。我先与对方确认共同目标，再用灰度数据说明影响范围，推动双方同意分阶段发布，并明确每阶段的验证指标。最终版本按期覆盖核心用户，且没有出现重大线上问题。",
  createdAt: "2026-07-20T01:35:00.000Z",
  order: 1,
} satisfies PracticeAnswer

export const motivationMainAnswer = {
  id: "practice_answer_motivation_main_01",
  content:
    "我希望应聘这个岗位，是因为它同时需要复杂前端系统建设和跨团队推动能力。过去几年我持续负责性能治理与基础设施建设，既能解决工程问题，也能把技术结果连接到业务指标。下一阶段我希望承担更完整的技术决策责任，并帮助团队建立可持续的工程能力。",
  createdAt: "2026-07-20T01:35:00.000Z",
  order: 1,
} satisfies PracticeAnswer

export const firstProjectFollowUpQuestion = createPracticeFollowUpQuestion({
  question,
  order: 1,
  createdAt: "2026-07-20T01:35:05.000Z",
})

export const firstAnsweredProjectFollowUp = {
  status: "answered",
  question: firstProjectFollowUpQuestion,
  answer: {
    id: "practice_answer_follow_up_01",
    content:
      "我们按设备性能分层做了灰度对照，并保持同期产品功能一致。低端设备实验组的可交互时间和退出率同步改善，高端设备变化不显著，因此可以较有把握地判断性能优化是主要因素。",
    createdAt: "2026-07-20T01:37:00.000Z",
    order: 2,
  },
} satisfies AnsweredPracticeFollowUpExchange

export const secondProjectFollowUpQuestion = createPracticeFollowUpQuestion({
  question,
  order: 2,
  createdAt: "2026-07-20T01:37:05.000Z",
})

export const secondAnsweredProjectFollowUp = {
  status: "answered",
  question: secondProjectFollowUpQuestion,
  answer: {
    id: "practice_answer_follow_up_02",
    content:
      "我先把争议拆成包体收益、改造成本和发布风险三部分，用现网数据估算收益，再推动团队用一个低风险路由做小范围实验。实验结果达到约定阈值后，我们共同评审分阶段方案，并为每一阶段设置监控和回滚条件。",
    createdAt: "2026-07-20T01:39:00.000Z",
    order: 3,
  },
} satisfies AnsweredPracticeFollowUpExchange

export const completedProjectFollowUps = [
  firstAnsweredProjectFollowUp,
  secondAnsweredProjectFollowUp,
] satisfies AnsweredPracticeFollowUpExchange[]

export const behavioralFollowUpQuestion = createPracticeFollowUpQuestion({
  question: behavioralQuestion,
  order: 1,
  createdAt: "2026-07-20T01:35:05.000Z",
})

export const scoreDimensions = [
  {
    dimension: "relevance",
    score: 90,
    explanation: "回答始终围绕性能优化经历展开，与问题高度相关。",
  },
  {
    dimension: "structure",
    score: 84,
    explanation: "背景、行动和结果清楚，但关键决策的层次还可以更突出。",
  },
  {
    dimension: "specificity",
    score: 88,
    explanation: "给出了瓶颈、优化动作和设备分层等具体信息。",
  },
  {
    dimension: "personalContribution",
    score: 82,
    explanation: "说明了个人负责定位和推动，但跨团队影响方式还不够具体。",
  },
  {
    dimension: "resultsAndEvidence",
    score: 92,
    explanation: "使用 P75 指标、退出率和灰度对照支撑结果。",
  },
  {
    dimension: "roleAlignment",
    score: 86,
    explanation: "体现了高级前端岗位需要的性能治理和协作能力。",
  },
  {
    dimension: "communication",
    score: 83,
    explanation: "表达简洁清楚，可以进一步强调最关键的取舍。",
  },
  {
    dimension: "riskControl",
    score: 78,
    explanation: "提到了灰度验证，但没有说明回滚条件和监控告警。",
  },
] satisfies PracticeDimensionScore[]

export const evaluation = {
  overallScore: 85,
  dimensionScores: scoreDimensions,
  evaluatedAt: "2026-07-20T01:38:00.000Z",
} satisfies PracticeEvaluation

export const highScoreEvaluation = {
  overallScore: 94,
  dimensionScores: scoreDimensions.map((item) => ({
    ...item,
    score: Math.min(100, item.score + 8),
  })),
  evaluatedAt: "2026-07-20T01:38:00.000Z",
} satisfies PracticeEvaluation

export const lowScoreEvaluation = {
  overallScore: 58,
  dimensionScores: scoreDimensions.map((item) => ({
    ...item,
    score: Math.max(0, item.score - 27),
  })),
  evaluatedAt: "2026-07-20T01:38:00.000Z",
} satisfies PracticeEvaluation

export const retryReview = {
  overallPerformance: "回答有清晰的性能优化主线和量化结果，但个人推动过程与风险控制仍不够完整。",
  highlights: ["用 P75 可交互时间和退出率呈现业务结果", "通过设备分层灰度增强归因可信度"],
  mainIssues: ["团队分歧处理过程还可以补充更具体的个人沟通动作", "风险控制仍缺少持续监控细节"],
  improvementSuggestions: [
    "补充推动拆包方案达成一致的关键沟通动作",
    "说明灰度指标、告警阈值和回滚预案",
  ],
  reusableAnswerStructure: [
    "用业务影响界定问题",
    "用数据定位瓶颈",
    "说明个人决策与协作",
    "用实验验证结果与归因",
    "补充风险控制和复盘",
  ],
  exposedWeaknesses: ["个人影响力表达", "风险控制"],
  recommendation: {
    action: "retryCurrent",
    reason: "补齐推动过程和风险控制后重答，能让这段经历更符合高级岗位的能力要求。",
  },
} satisfies PracticeReview

export const nextReview = {
  overallPerformance: "回答结构完整，证据充分，已经能够清楚展示性能治理能力和个人贡献。",
  highlights: ["问题定位过程具体", "个人决策清晰", "结果与归因证据完整"],
  mainIssues: ["可以进一步压缩背景描述，让核心行动更突出"],
  improvementSuggestions: ["将背景控制在两句话内，优先呈现关键判断和取舍"],
  reusableAnswerStructure: ["业务问题", "数据定位", "关键取舍", "推动落地", "结果验证"],
  exposedWeaknesses: ["表达精炼度"],
  recommendation: {
    action: "nextQuestion",
    reason: "当前题已覆盖项目深挖的核心要求，下一题可继续训练高压场景下的技术取舍。",
    nextQuestion: {
      questionType: "projectDeepDive",
      difficulty: "pressure",
      focusAreas: ["技术取舍", "风险控制"],
    },
  },
} satisfies PracticeReview

export const highScoreReview = {
  overallPerformance: "回答主线清晰、个人贡献突出，并使用充分的数据和验证过程建立了可信度。",
  highlights: ["快速界定了业务影响和技术瓶颈", "关键取舍、协作动作与量化结果形成完整闭环"],
  mainIssues: ["可以进一步压缩背景信息，使关键决策更快被识别"],
  improvementSuggestions: ["将背景压缩为目标和约束两句话，把更多时间留给决策依据和复盘"],
  reusableAnswerStructure: [
    "目标与约束",
    "个人判断",
    "关键取舍",
    "推动落地",
    "量化验证",
    "复盘沉淀",
  ],
  exposedWeaknesses: ["表达精炼度"],
  recommendation: {
    action: "nextQuestion",
    reason: "本题能力证据已经完整，可以进入更高压力的技术取舍训练。",
    nextQuestion: {
      questionType: "technicalFoundation",
      difficulty: "pressure",
      focusAreas: ["技术取舍", "验证与风险"],
    },
  },
} satisfies PracticeReview

export const lowScoreReview = {
  overallPerformance:
    "回答提到了性能优化动作，但问题背景、个人职责、决策依据和结果证据尚未形成完整闭环。",
  highlights: ["识别了首屏包体和同步请求两个具体方向"],
  mainIssues: ["个人行动与团队行动边界不清楚", "缺少能够验证优化结果的指标和对照依据"],
  improvementSuggestions: [
    "明确说明自己负责的分析和推动动作",
    "补充优化前后指标、实验范围与风险控制",
  ],
  reusableAnswerStructure: [
    "业务问题",
    "个人职责",
    "分析依据",
    "方案取舍",
    "结果证据",
    "风险与复盘",
  ],
  exposedWeaknesses: ["个人贡献表达", "结果与数据支撑", "风险控制"],
  recommendation: {
    action: "retryCurrent",
    reason: "建议按可复用结构补齐个人行动和结果证据后重答当前题。",
  },
} satisfies PracticeReview

export const longReview = {
  ...retryReview,
  overallPerformance:
    "回答能够从业务影响切入，逐步说明问题定位、方案设计、跨团队推动和结果验证，整体叙述具有较好的完整性。当前最需要继续加强的是把每一次关键判断和候选人本人的具体动作建立更直接的对应关系，并明确说明灰度阶段观察了哪些指标、如何设置告警阈值、什么情况下启动回滚，以及这些机制如何帮助团队在控制发布风险的同时验证性能收益。",
  improvementSuggestions: [
    "将推动过程拆成发现分歧、澄清约束、提出可验证方案和促成决策四个连续动作，并分别说明你提供了什么信息、影响了哪位协作方以及最终形成了什么共识。",
    "把结果验证补充为优化前基线、实验组与对照组差异、持续观察周期、异常告警阈值和回滚条件，避免只用一个上线后的最终指标概括全部验证过程。",
  ],
} satisfies PracticeReview

export const noNewWeaknessesReview = {
  ...nextReview,
  exposedWeaknesses: [],
} satisfies PracticeReview
