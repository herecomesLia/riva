import type {
  ActivePracticeSelection,
  AnsweredPracticeFollowUpExchange,
  PracticeAnswer,
  PracticeAttemptRecord,
  PracticeDimensionScore,
  PracticeEvaluation,
  PracticeEvaluatingState,
  PracticeFollowUpQuestion,
  PracticePageResponse,
  PracticeQuestionCard,
  PracticeQuestionType,
  PracticeRecommendation,
  PracticeReview,
  PracticeReviewState,
  PracticeScoreDimension,
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
  attemptId: "practice_session_20260720_01_attempt_1",
  attemptNumber: 1,
  attemptRecords: [] as PracticeAttemptRecord[],
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
  attemptId: "practice_session_behavioral_20260720_01_attempt_1",
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
  attemptId: "practice_session_motivation_20260720_01_attempt_1",
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

const highScoreEvaluation = {
  overallScore: 94,
  dimensionScores: scoreDimensions.map((item) => ({
    ...item,
    score: Math.min(100, item.score + 8),
  })),
  evaluatedAt: "2026-07-20T01:38:00.000Z",
} satisfies PracticeEvaluation

const lowScoreEvaluation = {
  overallScore: 58,
  dimensionScores: scoreDimensions.map((item) => ({
    ...item,
    score: Math.max(0, item.score - 27),
  })),
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

const highScoreReview = {
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

const lowScoreReview = {
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

const longReview = {
  ...retryReview,
  overallPerformance:
    "回答能够从业务影响切入，逐步说明问题定位、方案设计、跨团队推动和结果验证，整体叙述具有较好的完整性。当前最需要继续加强的是把每一次关键判断和候选人本人的具体动作建立更直接的对应关系，并明确说明灰度阶段观察了哪些指标、如何设置告警阈值、什么情况下启动回滚，以及这些机制如何帮助团队在控制发布风险的同时验证性能收益。",
  improvementSuggestions: [
    "将推动过程拆成发现分歧、澄清约束、提出可验证方案和促成决策四个连续动作，并分别说明你提供了什么信息、影响了哪位协作方以及最终形成了什么共识。",
    "把结果验证补充为优化前基线、实验组与对照组差异、持续观察周期、异常告警阈值和回滚条件，避免只用一个上线后的最终指标概括全部验证过程。",
  ],
} satisfies PracticeReview

const noNewWeaknessesReview = {
  ...nextReview,
  exposedWeaknesses: [],
} satisfies PracticeReview

const practiceScoreDimensions = [
  "relevance",
  "structure",
  "specificity",
  "personalContribution",
  "resultsAndEvidence",
  "roleAlignment",
  "communication",
  "riskControl",
] as const satisfies readonly PracticeScoreDimension[]

type PracticeEvaluationTemplate = {
  overallScore: number
  scores: readonly number[]
  explanations: readonly string[]
  review: Omit<PracticeReview, "recommendation">
}

function createDimensionScores(
  scores: readonly number[],
  explanations: readonly string[],
): PracticeDimensionScore[] {
  return practiceScoreDimensions.map((dimension, index) => ({
    dimension,
    score: scores[index] ?? 0,
    explanation: explanations[index] ?? "",
  }))
}

const practiceEvaluationTemplates = {
  projectDeepDive: {
    overallScore: 85,
    scores: [90, 84, 88, 82, 92, 86, 83, 78],
    explanations: [
      "回答始终围绕性能优化经历展开，与问题高度相关。",
      "背景、行动和结果清楚，但关键决策的层次还可以更突出。",
      "给出了瓶颈、优化动作和设备分层等具体信息。",
      "说明了个人负责定位和推动，但跨团队影响方式还不够具体。",
      "使用 P75 指标、退出率和灰度对照支撑结果。",
      "体现了高级前端岗位需要的性能治理和协作能力。",
      "表达简洁清楚，可以进一步强调最关键的取舍。",
      "提到了灰度验证，但没有完整说明回滚条件和监控告警。",
    ],
    review: {
      overallPerformance: "回答有清晰的性能优化主线和量化结果，能够说明关键决策和个人贡献。",
      highlights: ["用 P75 可交互时间和退出率呈现业务结果", "通过设备分层灰度增强归因可信度"],
      mainIssues: ["跨团队影响方式还可以补充更具体的个人沟通动作"],
      improvementSuggestions: ["补充推动拆包方案达成一致的关键沟通动作", "说明监控告警和回滚预案"],
      reusableAnswerStructure: [
        "业务影响",
        "数据定位",
        "个人决策",
        "推动落地",
        "结果验证",
        "风险复盘",
      ],
      exposedWeaknesses: ["个人影响力表达", "风险控制"],
    },
  },
  behavioral: {
    overallScore: 84,
    scores: [87, 86, 82, 85, 80, 84, 88, 78],
    explanations: [
      "围绕一次具体协作分歧展开，回答没有偏离情境。",
      "情境、任务、行动和结果的顺序清楚。",
      "冲突背景具体，但关键沟通动作还可补充细节。",
      "清楚说明了你主动对齐目标和推动验证的行动。",
      "说明了阶段性发布结果，但量化影响还可以更完整。",
      "体现了目标岗位需要的协作与推动能力。",
      "表达直接，能够让协作过程易于理解。",
      "提到分阶段发布，仍可补充风险信号和兜底安排。",
    ],
    review: {
      overallPerformance: "回答能用具体情境说明个人行动和协作过程，结果与复盘方向基本完整。",
      highlights: ["先对齐共同目标再处理分歧", "用小范围验证推动协作方形成共识"],
      mainIssues: ["关键沟通动作和对方约束仍可展开", "结果的影响范围可以补充证据"],
      improvementSuggestions: ["用 STAR 顺序明确描述个人行动", "补充协作后的结果和复盘改进"],
      reusableAnswerStructure: [
        "情境与目标",
        "个人任务",
        "冲突与约束",
        "个人行动",
        "协作推进",
        "结果与复盘",
      ],
      exposedWeaknesses: ["结果与证据支撑", "风险控制"],
    },
  },
  businessUnderstanding: {
    overallScore: 83,
    scores: [88, 84, 81, 80, 85, 86, 82, 76],
    explanations: [
      "回答围绕业务目标和优先级判断，与题目高度相关。",
      "目标、指标、方案和业务影响的叙述结构清楚。",
      "给出了判断方向，但利益相关方约束还可更具体。",
      "说明了个人如何组织分析和推动决策。",
      "包含核心指标和业务结果，但对照依据可进一步补充。",
      "体现了目标岗位需要的业务判断和协作能力。",
      "表达清楚，取舍理由容易理解。",
      "需要进一步说明上线后的监控和风险预案。",
    ],
    review: {
      overallPerformance:
        "回答能够从业务目标和核心指标出发说明方案取舍，并体现了对利益相关方的判断。",
      highlights: ["用业务目标和指标组织决策", "能够比较不同方案对业务影响"],
      mainIssues: ["关键利益相关方的约束还不够具体", "结果验证和风险预案可以更完整"],
      improvementSuggestions: [
        "补充各方诉求、成本和风险的取舍依据",
        "说明指标变化如何验证业务影响",
      ],
      reusableAnswerStructure: [
        "业务目标",
        "核心指标",
        "利益相关方",
        "方案取舍",
        "决策推动",
        "业务影响与风险",
      ],
      exposedWeaknesses: ["利益相关方沟通", "风险控制"],
    },
  },
  motivation: {
    overallScore: 86,
    scores: [90, 85, 84, 82, 78, 91, 88, 76],
    explanations: [
      "回答始终围绕选择岗位的动机和匹配关系展开。",
      "过往经历、可带来的价值和职业目标的结构清楚。",
      "给出了真实经历连接，但可以再补充一个具体成果。",
      "说明了自己在相关经历中承担的责任。",
      "有经历证据支撑，但量化结果还可以更充分。",
      "清楚说明了过往能力与目标岗位的连接。",
      "表达自然，有明确的职业发展逻辑。",
      "可补充对岗位挑战和自身准备边界的理解。",
    ],
    review: {
      overallPerformance:
        "回答清楚连接了过往经历、目标岗位和下一阶段职业目标，岗位动机具有可信度。",
      highlights: ["说明了经历与岗位能力的直接连接", "职业发展目标具体且一致"],
      mainIssues: ["可增加一个具体成果来证明能带来的价值", "可补充对岗位挑战的理解"],
      improvementSuggestions: [
        "用一项真实成果说明可交付的价值",
        "说明你希望解决的岗位问题和准备方式",
      ],
      reusableAnswerStructure: [
        "选择岗位的原因",
        "相关经历连接",
        "可带来的价值",
        "岗位理解",
        "职业发展目标",
      ],
      exposedWeaknesses: ["结果与证据支撑", "岗位挑战认知"],
    },
  },
  technicalFoundation: {
    overallScore: 87,
    scores: [91, 86, 85, 80, 83, 89, 84, 88],
    explanations: [
      "回答聚焦技术概念、问题原因和解决方案。",
      "原理、分析、方案和验证的顺序完整。",
      "能够说明定位路径和设计细节。",
      "个人技术判断清楚，但决策边界可以更明确。",
      "给出了验证方式，仍可补充更多数据或反例。",
      "符合目标岗位对技术基础和工程设计的要求。",
      "技术表达准确，关键概念易于理解。",
      "明确考虑了权衡、验证和潜在风险。",
    ],
    review: {
      overallPerformance: "回答能够从原理出发，说明分析方法、方案权衡和验证方式，技术判断较完整。",
      highlights: ["先解释问题原因再提出方案", "能够说明权衡、验证和风险控制"],
      mainIssues: ["个人技术决策的边界还可以更清楚", "可增加一个反例或失败路径说明"],
      improvementSuggestions: ["明确每个方案选择背后的约束", "补充验证指标、失败信号和降级策略"],
      reusableAnswerStructure: [
        "概念与原理",
        "问题原因",
        "分析路径",
        "方案设计",
        "权衡",
        "验证与风险",
      ],
      exposedWeaknesses: ["个人技术决策表达", "结果与证据支撑"],
    },
  },
} satisfies Record<PracticeQuestionType, PracticeEvaluationTemplate>

function createPracticeRecommendation(
  session: PracticeEvaluatingState,
  template: PracticeEvaluationTemplate,
  review: Omit<PracticeReview, "recommendation">,
): PracticeRecommendation {
  if (session.followUpCompletion.status === "endedEarly" || template.overallScore < 70) {
    return {
      action: "retryCurrent",
      reason:
        session.followUpCompletion.status === "endedEarly"
          ? "当前追问提前结束，建议补齐未回答的关键信息后重答本题。"
          : "建议先补齐本题的关键能力证据后重答，形成更完整的回答闭环。",
    }
  }

  return {
    action: "nextQuestion",
    reason: "本题回答较完整，可以在相同题型下继续强化当前暴露的薄弱项。",
    nextQuestion: {
      questionType: session.selection.questionType,
      difficulty: session.selection.difficulty,
      focusAreas: review.exposedWeaknesses.slice(0, 2),
    },
  }
}

function createPracticeReview(
  session: PracticeEvaluatingState,
  template: PracticeEvaluationTemplate,
): PracticeReview {
  const review = structuredClone(template.review)

  if (session.followUpCompletion.status === "endedEarly") {
    const unanswered = session.followUpCompletion.unansweredQuestion.prompt
    review.overallPerformance = `${review.overallPerformance} 本题追问提前结束，证据和取舍信息尚未完整补充。`
    review.mainIssues.push(`未回答追问未补充：${unanswered}`)
    review.improvementSuggestions.push("重新回答时补齐当前追问要求的证据、取舍或风险信息。")
    review.exposedWeaknesses.push("追问证据完整性")
  }

  return {
    ...review,
    recommendation: createPracticeRecommendation(session, template, review),
  }
}

export function createPracticeMockEvaluationResult(session: PracticeEvaluatingState): {
  evaluation: PracticeEvaluation
  review: PracticeReview
} {
  const template = practiceEvaluationTemplates[session.question.questionType]
  const scoreAdjustment = session.followUpCompletion.status === "endedEarly" ? -12 : 0
  const evaluatedAt = new Date(Date.parse(session.submittedAt) + 1000).toISOString()
  const adjustedTemplate = {
    ...template,
    overallScore: template.overallScore + scoreAdjustment,
    scores: template.scores.map((score) => Math.max(0, score + scoreAdjustment)),
  }
  const review = createPracticeReview(session, adjustedTemplate)

  if (
    session.followUpCompletion.status === "completed" &&
    session.followUpCompletion.reason === "allAnswered"
  ) {
    review.highlights.push("追问回答补充了关键证据、取舍或风险信息")
  }

  return {
    evaluation: {
      overallScore: adjustedTemplate.overallScore,
      dimensionScores: createDimensionScores(
        adjustedTemplate.scores,
        adjustedTemplate.explanations,
      ),
      evaluatedAt,
    },
    review,
  }
}

function createPracticeReviewState(session: PracticeEvaluatingState): PracticeReviewState {
  const result = createPracticeMockEvaluationResult(session)

  return {
    status: "review",
    sessionId: session.sessionId,
    version: session.version + 1,
    selection: session.selection,
    startedAt: session.startedAt,
    attemptId: session.attemptId,
    attemptNumber: session.attemptNumber,
    attemptRecords: session.attemptRecords,
    question: session.question,
    mainAnswer: session.mainAnswer,
    followUpExchanges: session.followUpExchanges,
    followUpCompletion: session.followUpCompletion,
    evaluation: result.evaluation,
    review: result.review,
  }
}

const archivedProjectAttempt = {
  attemptId: activeSession.attemptId,
  attemptNumber: 1,
  completedAt: evaluation.evaluatedAt,
  selection: defaultSelection,
  question,
  mainAnswer,
  followUpExchanges: completedProjectFollowUps,
  followUpCompletion: { status: "completed", reason: "allAnswered" },
  evaluation,
  review: nextReview,
  isSaved: false,
  isMarkedWeak: false,
} satisfies PracticeAttemptRecord

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
  | "reviewBalanced"
  | "reviewHighScore"
  | "reviewLowScore"
  | "reviewLongContent"
  | "reviewNoNewWeaknesses"
  | "reviewMotivation"
  | "reviewFollowUpEndedEarly"
  | "completedSession"
  | "retryingCurrentQuestion"
  | "generatingNextQuestion"
  | "completedWithRetries"
  | "completedWithWeakQuestions"

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
      previousAttempt: null,
    },
  },
  generatingNextQuestion: {
    setupContext,
    session: {
      status: "generatingQuestion",
      ...activeSession,
      attemptId: `${activeSession.sessionId}_attempt_2`,
      attemptNumber: 2,
      attemptRecords: [archivedProjectAttempt],
      previousAttempt: archivedProjectAttempt,
    },
  },
  retryingCurrentQuestion: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      attemptId: `${activeSession.sessionId}_attempt_2`,
      attemptNumber: 2,
      attemptRecords: [archivedProjectAttempt],
      question,
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
  reviewBalanced: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: { status: "completed", reason: "allAnswered" },
      evaluation,
      review: nextReview,
    },
  },
  reviewHighScore: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: { status: "completed", reason: "allAnswered" },
      evaluation: highScoreEvaluation,
      review: highScoreReview,
    },
  },
  reviewLowScore: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: { status: "completed", reason: "allAnswered" },
      evaluation: lowScoreEvaluation,
      review: lowScoreReview,
    },
  },
  reviewLongContent: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: { status: "completed", reason: "allAnswered" },
      evaluation,
      review: longReview,
    },
  },
  reviewNoNewWeaknesses: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: { status: "completed", reason: "allAnswered" },
      evaluation,
      review: noNewWeaknessesReview,
    },
  },
  reviewMotivation: {
    setupContext,
    session: createPracticeReviewState({
      status: "evaluating",
      ...motivationActiveSession,
      question: motivationQuestion,
      mainAnswer: motivationMainAnswer,
      followUpExchanges: [],
      followUpCompletion: { status: "completed", reason: "noFollowUpRequired" },
      submittedAt: "2026-07-20T01:35:00.000Z",
    }),
  },
  reviewFollowUpEndedEarly: {
    setupContext,
    session: createPracticeReviewState({
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
    }),
  },
  completedSession: {
    setupContext,
    session: {
      status: "completed",
      ...activeSession,
      attemptRecords: [archivedProjectAttempt],
      completedAt: "2026-07-20T01:40:00.000Z",
      questionsCompleted: 1,
      retryCount: 0,
      savedQuestionCount: 0,
      newWeaknessCount: 0,
      averageScore: evaluation.overallScore,
      nextStepSuggestion: "继续围绕项目深挖补充量化证据，再进入下一轮练习。",
    },
  },
  completedWithRetries: {
    setupContext,
    session: {
      status: "completed",
      ...activeSession,
      attemptId: `${activeSession.sessionId}_attempt_2`,
      attemptNumber: 2,
      attemptRecords: [
        archivedProjectAttempt,
        {
          ...archivedProjectAttempt,
          attemptId: `${activeSession.sessionId}_attempt_2`,
          attemptNumber: 2,
        },
      ],
      completedAt: "2026-07-20T01:41:00.000Z",
      questionsCompleted: 1,
      retryCount: 1,
      savedQuestionCount: 0,
      newWeaknessCount: 0,
      averageScore: evaluation.overallScore,
      nextStepSuggestion: "继续围绕项目深挖补充量化证据，再进入下一轮练习。",
    },
  },
  completedWithWeakQuestions: {
    setupContext,
    session: {
      status: "completed",
      ...activeSession,
      attemptRecords: [{ ...archivedProjectAttempt, isMarkedWeak: true }],
      completedAt: "2026-07-20T01:41:00.000Z",
      questionsCompleted: 1,
      retryCount: 0,
      savedQuestionCount: 0,
      newWeaknessCount: 1,
      averageScore: evaluation.overallScore,
      nextStepSuggestion: "优先补足本轮暴露的薄弱项。",
    },
  },
} satisfies Record<PracticeMockScenario, PracticePageResponse>

export const practiceResponseMock = practiceMockScenarios.setupReady

export function createPracticeMockResponse(
  scenario: PracticeMockScenario = "setupReady",
): PracticePageResponse {
  return structuredClone(practiceMockScenarios[scenario])
}
