import type {
  ActivePracticeSelection,
  AnsweredPracticeFollowUpExchange,
  PracticeAnswer,
  PracticeDimensionScore,
  PracticeEvaluation,
  PracticeFollowUpQuestion,
  PracticePageResponse,
  PracticeQuestionCard,
  PracticeQuestionType,
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

type GeneratedQuestionTemplate = {
  prompts: readonly [string, string]
  assessedCapabilities: readonly string[]
  recommendedMaterials: readonly string[]
}

type GeneratedQuestionGuidanceTemplate = {
  hints: readonly string[]
  framework: readonly string[]
}

type PracticeFollowUpTemplate = {
  prompts: readonly string[]
}

const generatedQuestionTemplates = {
  projectDeepDive: {
    prompts: [
      "请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。",
      "请选择一个你深度参与的复杂项目，说明你做出的关键技术取舍、遇到的阻力以及最终结果。",
    ],
    assessedCapabilities: ["问题分析", "技术决策", "跨团队协作", "结果量化"],
    recommendedMaterials: ["全球电商结算页性能优化项目", "性能监控平台建设经历"],
  },
  behavioral: {
    prompts: [
      "请介绍一次你与关键协作方存在明显分歧的经历，你如何推动团队形成共识并完成目标？",
      "请回顾一次高压期限下出现突发问题的经历，你如何确定优先级、协调资源并控制影响？",
    ],
    assessedCapabilities: ["协作沟通", "冲突处理", "推动力", "复盘意识"],
    recommendedMaterials: ["跨团队项目协作经历", "线上突发事件处理经历"],
  },
  businessUnderstanding: {
    prompts: [
      "请介绍一次你基于业务目标调整产品或技术优先级的经历，并说明你的判断依据和结果。",
      "面对用户体验与短期业务收益之间的冲突时，你会如何分析取舍并推动决策？",
    ],
    assessedCapabilities: ["业务判断", "优先级管理", "数据分析", "利益相关方沟通"],
    recommendedMaterials: ["核心指标改进项目", "产品或技术优先级调整经历"],
  },
  motivation: {
    prompts: [
      "为什么你希望应聘当前目标岗位？请结合过往经历说明你的匹配点和下一阶段目标。",
      "请说明你选择这个职业方向的关键原因，以及当前岗位如何连接你的长期发展计划。",
    ],
    assessedCapabilities: ["求职动机", "岗位认知", "自我认知", "职业规划"],
    recommendedMaterials: ["职业选择关键节点", "与目标岗位相关的成长经历"],
  },
  technicalFoundation: {
    prompts: [
      "请解释 React 页面出现重复渲染的常见原因，并说明你会如何定位和验证优化效果。",
      "设计一个需要长期演进的前端数据请求层时，你会如何处理类型安全、缓存一致性和错误边界？",
    ],
    assessedCapabilities: ["技术原理", "问题定位", "工程设计", "风险意识"],
    recommendedMaterials: ["React 性能排查经历", "前端基础设施设计经历"],
  },
} satisfies Record<PracticeQuestionType, GeneratedQuestionTemplate>

const generatedQuestionGuidanceTemplates = {
  projectDeepDive: {
    hints: [
      "先交代项目背景、业务目标和关键约束。",
      "明确你的个人职责，以及你实际负责解决的问题。",
      "说明关键决策、备选方案和做出取舍的依据。",
      "补充你如何推动协作方落地方案并处理阻力。",
      "用量化指标呈现结果，并说明结果如何得到验证。",
    ],
    framework: [
      "背景与目标：说明项目要解决的问题、目标和约束。",
      "个人职责：界定你的责任范围和需要推动的关键事项。",
      "决策与行动：展开关键判断、方案取舍和推动过程。",
      "结果与复盘：呈现量化结果、验证方式和后续改进。",
    ],
  },
  behavioral: {
    hints: [
      "选择一个具体情境，说明当时的目标和你的角色。",
      "明确冲突、挑战或压力来自哪里。",
      "聚焦你个人采取的行动，而不是只描述团队做了什么。",
      "说明你如何沟通、协调并推动相关方形成共识。",
      "交代最终结果，以及你从这次经历中得到的复盘。",
    ],
    framework: [
      "情境（Situation）：交代背景、目标和关键参与方。",
      "任务（Task）：说明你承担的责任和面对的挑战。",
      "行动（Action）：具体展开你的判断、沟通和推动动作。",
      "结果（Result）：说明结果、证据和事后复盘。",
    ],
  },
  businessUnderstanding: {
    hints: [
      "先明确要支持的业务目标和问题边界。",
      "指出用于判断优先级和效果的核心指标。",
      "识别用户、业务方和交付团队等关键利益相关方。",
      "比较不同方案的收益、成本、风险和取舍。",
      "说明最终决策对业务结果产生了什么影响。",
    ],
    framework: [
      "业务目标：定义问题、目标用户和成功指标。",
      "关键洞察：说明数据依据与利益相关方诉求。",
      "方案取舍：比较选项并解释最终决策。",
      "业务影响：呈现结果、验证方式和后续调整。",
    ],
  },
  motivation: {
    hints: [
      "具体说明你为什么选择这个岗位，而不是泛泛表达兴趣。",
      "连接过往经历、能力积累与岗位的核心要求。",
      "说明你能为团队或业务带来的独特价值。",
      "交代这个岗位与你下一阶段职业发展目标的关系。",
    ],
    framework: [
      "岗位吸引力：说明你对岗位职责和机会的理解。",
      "经历连接：用相关经历证明能力与岗位要求匹配。",
      "可贡献价值：概括你能解决的问题和带来的价值。",
      "发展目标：说明岗位与长期职业方向如何衔接。",
    ],
  },
  technicalFoundation: {
    hints: [
      "先准确界定相关概念、工作原理和适用边界。",
      "分析问题可能出现的原因，并说明排查顺序。",
      "提出可落地的分析或设计方案。",
      "比较方案在复杂度、性能、维护性和风险上的权衡。",
      "说明如何验证方案有效，并控制上线或演进风险。",
    ],
    framework: [
      "概念与原理：定义核心概念并解释运行机制。",
      "原因分析：列出关键影响因素和定位思路。",
      "方案设计：给出步骤、边界和必要的工程措施。",
      "权衡与验证：说明取舍、验证指标和风险控制。",
    ],
  },
} satisfies Record<PracticeQuestionType, GeneratedQuestionGuidanceTemplate>

const practiceFollowUpTemplates = {
  projectDeepDive: {
    prompts: [
      "你如何验证结果主要来自你的关键决策，而不是同期的其他变化？",
      "推进过程中最大的分歧是什么，你具体如何促成团队达成一致？",
    ],
  },
  behavioral: {
    prompts: ["如果重新处理这次冲突，你会调整哪一个具体行动，为什么？"],
  },
  businessUnderstanding: {
    prompts: ["当核心指标与关键利益相关方诉求冲突时，你会如何确定最终取舍？"],
  },
  motivation: {
    prompts: [],
  },
  technicalFoundation: {
    prompts: [
      "你会优先验证哪个关键假设，并用什么证据判断方案有效？",
      "这个方案最需要防范的风险是什么，你会如何设计降级或回滚措施？",
    ],
  },
} satisfies Record<PracticeQuestionType, PracticeFollowUpTemplate>

export function getPracticeFollowUpPrompts(questionType: PracticeQuestionType): string[] {
  return [...practiceFollowUpTemplates[questionType].prompts]
}

export function createPracticeFollowUpQuestion({
  question,
  order,
  createdAt,
}: {
  question: PracticeQuestionCard
  order: number
  createdAt: string
}): PracticeFollowUpQuestion {
  const prompt = getPracticeFollowUpPrompts(question.questionType)[order - 1]
  if (!prompt) throw new Error("Practice follow-up order is outside the mock plan.")

  return {
    id: `${question.id}_follow_up_${order}`,
    prompt,
    createdAt,
    order,
  }
}

export function createGeneratedPracticeQuestionGuidance(questionType: PracticeQuestionType): {
  hints: string[]
  framework: string[]
} {
  const template = generatedQuestionGuidanceTemplates[questionType]
  return {
    hints: [...template.hints],
    framework: [...template.framework],
  }
}

export function createGeneratedPracticeQuestion({
  sessionId,
  ordinal,
  selection,
}: {
  sessionId: string
  ordinal: number
  selection: ActivePracticeSelection
}): PracticeQuestionCard {
  const template = generatedQuestionTemplates[selection.questionType]
  const prompt = template.prompts[(ordinal - 1) % template.prompts.length] ?? template.prompts[0]

  return {
    id: `practice_question_${sessionId}_${ordinal}`,
    prompt,
    questionType: selection.questionType,
    difficulty: selection.difficulty,
    assessedCapabilities: [...template.assessedCapabilities],
    recommendedMaterials: [...template.recommendedMaterials],
    answerHints: { status: "notRequested", content: null },
    answerFramework: { status: "notRequested", content: null },
    isSaved: selection.source === "saved",
    isMarkedWeak: false,
  }
}

const activeSession = {
  sessionId: "practice_session_20260720_01",
  version: 1,
  selection: defaultSelection,
  startedAt: "2026-07-20T01:30:00.000Z",
} as const

const question = createGeneratedPracticeQuestion({
  sessionId: activeSession.sessionId,
  ordinal: 1,
  selection: defaultSelection,
})

const behavioralSelection = {
  ...defaultSelection,
  questionType: "behavioral",
} satisfies ActivePracticeSelection

const behavioralActiveSession = {
  ...activeSession,
  sessionId: "practice_session_behavioral_20260720_01",
  selection: behavioralSelection,
} as const

const behavioralQuestion = createGeneratedPracticeQuestion({
  sessionId: behavioralActiveSession.sessionId,
  ordinal: 1,
  selection: behavioralSelection,
})

const motivationSelection = {
  ...defaultSelection,
  questionType: "motivation",
} satisfies ActivePracticeSelection

const motivationActiveSession = {
  ...activeSession,
  sessionId: "practice_session_motivation_20260720_01",
  selection: motivationSelection,
} as const

const motivationQuestion = createGeneratedPracticeQuestion({
  sessionId: motivationActiveSession.sessionId,
  ordinal: 1,
  selection: motivationSelection,
})

const defaultGuidance = createGeneratedPracticeQuestionGuidance(question.questionType)

const hintRevealedQuestion = {
  ...question,
  answerHints: {
    status: "revealed",
    content: defaultGuidance.hints,
  },
} satisfies PracticeQuestionCard

const frameworkRevealedQuestion = {
  ...question,
  answerFramework: {
    status: "revealed",
    content: defaultGuidance.framework,
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

const behavioralMainAnswer = {
  id: "practice_answer_behavioral_main_01",
  content:
    "在一次跨团队发布中，业务方希望按原计划全量上线，但监控显示核心链路仍有风险。我先与对方确认共同目标，再用灰度数据说明影响范围，推动双方同意分阶段发布，并明确每阶段的验证指标。最终版本按期覆盖核心用户，且没有出现重大线上问题。",
  createdAt: "2026-07-20T01:35:00.000Z",
  order: 1,
} satisfies PracticeAnswer

const motivationMainAnswer = {
  id: "practice_answer_motivation_main_01",
  content:
    "我希望应聘这个岗位，是因为它同时需要复杂前端系统建设和跨团队推动能力。过去几年我持续负责性能治理与基础设施建设，既能解决工程问题，也能把技术结果连接到业务指标。下一阶段我希望承担更完整的技术决策责任，并帮助团队建立可持续的工程能力。",
  createdAt: "2026-07-20T01:35:00.000Z",
  order: 1,
} satisfies PracticeAnswer

const firstProjectFollowUpQuestion = createPracticeFollowUpQuestion({
  question,
  order: 1,
  createdAt: "2026-07-20T01:35:05.000Z",
})

const firstAnsweredProjectFollowUp = {
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

const secondProjectFollowUpQuestion = createPracticeFollowUpQuestion({
  question,
  order: 2,
  createdAt: "2026-07-20T01:37:05.000Z",
})

const secondAnsweredProjectFollowUp = {
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

const completedProjectFollowUps = [
  firstAnsweredProjectFollowUp,
  secondAnsweredProjectFollowUp,
] satisfies AnsweredPracticeFollowUpExchange[]

const behavioralFollowUpQuestion = createPracticeFollowUpQuestion({
  question: behavioralQuestion,
  order: 1,
  createdAt: "2026-07-20T01:35:05.000Z",
})

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
  | "answeringFirstFollowUp"
  | "answeringSingleFollowUp"
  | "answeringFollowUp"
  | "evaluatingNoFollowUp"
  | "evaluatingFollowUpEndedEarly"
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
  answeringFirstFollowUp: {
    setupContext,
    session: {
      status: "answeringFollowUp",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: [],
      currentFollowUp: {
        status: "awaitingAnswer",
        question: firstProjectFollowUpQuestion,
        answer: null,
      },
    },
  },
  answeringSingleFollowUp: {
    setupContext,
    session: {
      status: "answeringFollowUp",
      ...behavioralActiveSession,
      question: behavioralQuestion,
      mainAnswer: behavioralMainAnswer,
      followUpExchanges: [],
      currentFollowUp: {
        status: "awaitingAnswer",
        question: behavioralFollowUpQuestion,
        answer: null,
      },
    },
  },
  answeringFollowUp: {
    setupContext,
    session: {
      status: "answeringFollowUp",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: [firstAnsweredProjectFollowUp],
      currentFollowUp: {
        status: "awaitingAnswer",
        question: secondProjectFollowUpQuestion,
        answer: null,
      },
    },
  },
  evaluatingNoFollowUp: {
    setupContext,
    session: {
      status: "evaluating",
      ...motivationActiveSession,
      question: motivationQuestion,
      mainAnswer: motivationMainAnswer,
      followUpExchanges: [],
      followUpCompletion: {
        status: "completed",
        reason: "noFollowUpRequired",
      },
      submittedAt: "2026-07-20T01:35:00.000Z",
    },
  },
  evaluatingFollowUpEndedEarly: {
    setupContext,
    session: {
      status: "evaluating",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: [firstAnsweredProjectFollowUp],
      followUpCompletion: {
        status: "endedEarly",
        unansweredQuestion: secondProjectFollowUpQuestion,
      },
      submittedAt: "2026-07-20T01:38:00.000Z",
    },
  },
  evaluatingAnswer: {
    setupContext,
    session: {
      status: "evaluating",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: {
        status: "completed",
        reason: "allAnswered",
      },
      submittedAt: "2026-07-20T01:39:00.000Z",
    },
  },
  reviewRetryRecommended: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: {
        status: "completed",
        reason: "allAnswered",
      },
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
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: {
        status: "completed",
        reason: "allAnswered",
      },
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
