import type {
  ActivePracticeSelection,
  AnsweredPracticeFollowUpExchange,
  PracticeAnswer,
  PracticeDimensionScore,
  PracticeEvaluation,
  PracticeFollowUpQuestion,
  PracticePageResponse,
  PracticeQuestionCard,
  PracticeReview,
  PracticeSetupContext,
} from "@/models/practice"

const targetRoles = [
  {
    id: "role_frontend_bytedance",
    title: "Senior Frontend Engineer",
    company: "ByteDance",
    supportedQuestionTypes: [
      "projectDeepDive",
      "behavioral",
      "businessUnderstanding",
      "motivation",
      "technicalFoundation",
    ],
  },
  {
    id: "role_product_manager_meituan",
    title: "Product Manager",
    company: "Meituan",
    supportedQuestionTypes: [
      "projectDeepDive",
      "behavioral",
      "businessUnderstanding",
      "motivation",
    ],
  },
] satisfies PracticeSetupContext["targetRoles"]

const setupContext = {
  targetRoles,
  defaultTargetRoleId: "role_frontend_bytedance",
  eligibleQuestionCounts: {
    saved: 3,
    history: 5,
  },
} satisfies PracticeSetupContext

const defaultSelection = {
  targetRoleId: "role_frontend_bytedance",
  questionType: "projectDeepDive",
  difficulty: "basic",
  source: "personalized",
  prioritizeWeaknesses: false,
} satisfies ActivePracticeSelection

const activeSession = {
  sessionId: "practice_session_20260720_01",
  version: 1,
  selection: defaultSelection,
  startedAt: "2026-07-20T01:30:00.000Z",
} as const

const question = {
  id: "practice_question_checkout_performance",
  prompt: "请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。",
  questionType: "projectDeepDive",
  difficulty: "basic",
  assessedCapabilities: ["问题分析", "技术决策", "跨团队协作", "结果量化"],
  recommendedMaterials: ["全球电商结算页性能优化项目", "性能监控平台建设经历"],
  answerHints: {
    status: "notRequested",
    content: null,
  },
  answerFramework: {
    status: "notRequested",
    content: null,
  },
  isSaved: false,
  isMarkedWeak: false,
} satisfies PracticeQuestionCard

export const practiceAnswerHintContent = [
  "先界定性能问题对业务和用户的影响。",
  "重点说明你个人做出的判断、取舍和推动动作。",
  "用指标解释结果，并补充验证方式。",
]

export const practiceAnswerFrameworkContent = [
  "背景：用一两句话说明问题和目标。",
  "任务：明确你的职责与关键约束。",
  "行动：按判断、方案、协作和风险控制展开。",
  "结果：用指标呈现结果，并说明如何验证。",
]

const hintRevealedQuestion = {
  ...question,
  answerHints: {
    status: "revealed",
    content: practiceAnswerHintContent,
  },
} satisfies PracticeQuestionCard

const frameworkRevealedQuestion = {
  ...question,
  answerFramework: {
    status: "revealed",
    content: practiceAnswerFrameworkContent,
  },
} satisfies PracticeQuestionCard

const savedQuestion = {
  ...question,
  isSaved: true,
} satisfies PracticeQuestionCard

const weakQuestion = {
  ...question,
  isMarkedWeak: true,
} satisfies PracticeQuestionCard

const mainAnswer = {
  id: "practice_answer_main_01",
  content:
    "在全球电商结算页项目中，我发现低端设备的可交互时间超过五秒。我负责拆解性能数据，定位到首屏包体和同步请求是主要瓶颈，并推动团队实施路由级拆包、接口并行和关键资源预加载。上线后，P75 可交互时间下降到三秒以内，结算页退出率下降了 8%。",
  createdAt: "2026-07-20T01:35:00.000Z",
  order: 1,
} satisfies PracticeAnswer

const answeredFollowUpQuestion = {
  id: "practice_follow_up_tradeoff",
  prompt: "你如何证明退出率下降主要来自这次性能优化，而不是同期的其他改动？",
  createdAt: "2026-07-20T01:35:05.000Z",
  order: 1,
} satisfies PracticeFollowUpQuestion

const answeredFollowUp = {
  status: "answered",
  question: answeredFollowUpQuestion,
  answer: {
    id: "practice_answer_follow_up_01",
    content:
      "我们按设备性能分层做了灰度对照，并保持同期产品功能一致。低端设备实验组的可交互时间和退出率同步改善，高端设备变化不显著，因此可以较有把握地判断性能优化是主要因素。",
    createdAt: "2026-07-20T01:37:00.000Z",
    order: 2,
  },
} satisfies AnsweredPracticeFollowUpExchange

const pendingFollowUpQuestion = {
  id: "practice_follow_up_collaboration",
  prompt: "当团队对拆包方案的收益存在质疑时，你具体如何推动大家达成一致？",
  createdAt: "2026-07-20T01:37:05.000Z",
  order: 2,
} satisfies PracticeFollowUpQuestion

const scoreDimensions = [
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

const evaluation = {
  overallScore: 85,
  dimensionScores: scoreDimensions,
  evaluatedAt: "2026-07-20T01:38:00.000Z",
} satisfies PracticeEvaluation

const retryReview = {
  overallPerformance: "回答有清晰的性能优化主线和量化结果，但个人推动过程与风险控制仍不够完整。",
  highlights: ["用 P75 可交互时间和退出率呈现业务结果", "通过设备分层灰度增强归因可信度"],
  mainIssues: ["没有具体说明如何处理团队分歧", "缺少上线风险、回滚条件和持续监控"],
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

const nextReview = {
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

export type PracticeMockScenario =
  | "setupReady"
  | "noRoles"
  | "noEligibleSavedQuestions"
  | "noEligibleHistoryQuestions"
  | "generatingQuestion"
  | "answeringQuestion"
  | "answeringHintRevealed"
  | "answeringFrameworkRevealed"
  | "answeringSavedQuestion"
  | "answeringWeakQuestion"
  | "answeringFollowUp"
  | "evaluatingAnswer"
  | "reviewRetryRecommended"
  | "reviewNextRecommended"
  | "completedSession"

const practiceMockScenarios = {
  setupReady: {
    setupContext,
    session: {
      status: "setup",
      selection: defaultSelection,
    },
  },
  noRoles: {
    setupContext: {
      targetRoles: [],
      defaultTargetRoleId: null,
      eligibleQuestionCounts: { saved: 0, history: 0 },
    },
    session: {
      status: "setup",
      selection: { ...defaultSelection, targetRoleId: null },
    },
  },
  noEligibleSavedQuestions: {
    setupContext: {
      ...setupContext,
      eligibleQuestionCounts: { ...setupContext.eligibleQuestionCounts, saved: 0 },
    },
    session: {
      status: "setup",
      selection: { ...defaultSelection, source: "saved" },
    },
  },
  noEligibleHistoryQuestions: {
    setupContext: {
      ...setupContext,
      eligibleQuestionCounts: { ...setupContext.eligibleQuestionCounts, history: 0 },
    },
    session: {
      status: "setup",
      selection: { ...defaultSelection, source: "history" },
    },
  },
  generatingQuestion: {
    setupContext,
    session: {
      status: "generatingQuestion",
      ...activeSession,
    },
  },
  answeringQuestion: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      question,
    },
  },
  answeringHintRevealed: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      question: hintRevealedQuestion,
    },
  },
  answeringFrameworkRevealed: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      question: frameworkRevealedQuestion,
    },
  },
  answeringSavedQuestion: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      question: savedQuestion,
    },
  },
  answeringWeakQuestion: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      question: weakQuestion,
    },
  },
  answeringFollowUp: {
    setupContext,
    session: {
      status: "answeringFollowUp",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: [answeredFollowUp],
      currentFollowUp: {
        status: "awaitingAnswer",
        question: pendingFollowUpQuestion,
        answer: null,
      },
    },
  },
  evaluatingAnswer: {
    setupContext,
    session: {
      status: "evaluating",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: [answeredFollowUp],
      submittedAt: "2026-07-20T01:37:00.000Z",
    },
  },
  reviewRetryRecommended: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: [answeredFollowUp],
      evaluation,
      review: retryReview,
    },
  },
  reviewNextRecommended: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: [answeredFollowUp],
      evaluation,
      review: nextReview,
    },
  },
  completedSession: {
    setupContext,
    session: {
      status: "completed",
      ...activeSession,
      completedAt: "2026-07-20T01:40:00.000Z",
      questionsCompleted: 1,
    },
  },
} satisfies Record<PracticeMockScenario, PracticePageResponse>

export const practiceResponseMock = practiceMockScenarios.setupReady

export function createPracticeMockResponse(
  scenario: PracticeMockScenario = "setupReady",
): PracticePageResponse {
  return structuredClone(practiceMockScenarios[scenario])
}
