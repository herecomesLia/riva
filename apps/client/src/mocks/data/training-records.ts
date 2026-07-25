import type {
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
  TrainingRecordEvaluation,
  TrainingRecordQuestion,
  TrainingRecordReferenceAnswer,
  TrainingRecordReview,
} from "@/models/training-records"
import { createRolesMockResponse } from "@/mocks/data/roles"

const historyRoles = createRolesMockResponse("multipleRolesReady").roles

function roleSnapshot(roleId: string) {
  const role = historyRoles.find(({ id }) => id === roleId)
  if (role === undefined) throw new Error(`History fixture role "${roleId}" is missing.`)
  return { id: role.id, title: role.title, company: role.company }
}

const frontendRole = roleSnapshot("role_frontend_bytedance")
const productRole = roleSnapshot("role_product_manager_meituan")

function evaluation(
  overallScore: number,
  evaluatedAt: string,
  explanation: string,
): TrainingRecordEvaluation {
  return {
    overallScore,
    dimensions: [
      { dimension: "relevance", score: overallScore + 2, explanation },
      { dimension: "structure", score: overallScore - 2, explanation },
    ],
    evaluatedAt,
  }
}

function review(summary: string, issue: string): TrainingRecordReview {
  return {
    summary,
    strengths: ["能够结合真实经历说明采取的行动。"],
    issues: [issue],
    improvementSuggestions: ["按背景、目标、行动和结果组织内容，并补充可验证的数据。"],
    reusableAnswerStructure: ["先说明背景与目标", "突出个人判断和行动", "用数据结果收束并复盘"],
  }
}

function readyReference(exampleAnswer: string, generatedAt: string): TrainingRecordReferenceAnswer {
  return {
    status: "ready",
    content: {
      recommendedStructure: ["交代业务背景与目标", "说明关键判断和个人行动", "用结果与复盘收束"],
      keyPoints: ["明确个人贡献", "解释方案取舍", "量化最终结果"],
      exampleAnswer,
      usageGuidance: "参考结构和信息密度，结合自己的真实经历重新组织回答。",
      generatedAt,
    },
  }
}

const completedPracticeQuestion: TrainingRecordQuestion = {
  id: "history-practice-question-001",
  prompt: "请介绍一次你主导前端性能治理的经历，并说明如何验证治理结果。",
  type: "projectDeepDive",
  order: 1,
  attemptNumber: 2,
  retryOfQuestionId: "history-practice-question-001-original",
  assessedCapabilities: ["性能分析", "技术决策", "结果量化"],
  isSaved: true,
  isMarkedWeak: false,
  answer: {
    id: "history-practice-answer-001",
    content:
      "我负责的交易工作台首屏较慢。我先用真实用户监控建立基线，定位到长任务和重复请求，再分阶段拆包、缓存并灰度发布。最终首屏时间从 3.8 秒降到 2.1 秒，核心流程转化率提升了 6%。",
    submittedAt: "2026-07-20T02:05:00.000Z",
  },
  evaluation: evaluation(
    86,
    "2026-07-20T02:12:00.000Z",
    "回答紧扣问题，但方案取舍还可以解释得更完整。",
  ),
  review: review("背景、行动和结果完整，量化证据清晰。", "没有说明为何优先处理长任务。"),
  referenceAnswer: readyReference(
    "我先以真实用户数据确认最影响转化的性能瓶颈，再按风险拆分治理步骤，并通过灰度组与对照组验证技术指标和业务指标。",
    "2026-07-20T02:13:00.000Z",
  ),
  followUps: [
    {
      id: "history-practice-follow-up-001",
      prompt: "如果业务不允许暂停迭代，你如何控制性能改造的交付风险？",
      order: 1,
      askedAt: "2026-07-20T02:06:00.000Z",
      answer: {
        id: "history-practice-follow-up-answer-001",
        content:
          "我把改造拆成监控补齐、低风险优化和架构调整三层，每层都设置回滚开关，并让性能改造随正常版本小步发布。",
        submittedAt: "2026-07-20T02:09:00.000Z",
      },
      evaluation: evaluation(
        82,
        "2026-07-20T02:12:30.000Z",
        "风险控制方法具体，还可以补充跨团队协作方式。",
      ),
      review: review("能够给出渐进式交付和回滚机制。", "跨团队协同过程描述不足。"),
      referenceAnswer: readyReference(
        "我会先补齐监控和回滚能力，再将改造拆成可独立验证的小批次，随业务版本灰度，并明确每一阶段的停止条件。",
        "2026-07-20T02:13:30.000Z",
      ),
    },
  ],
}

const completedPracticeOriginalQuestion: TrainingRecordQuestion = {
  ...completedPracticeQuestion,
  id: "history-practice-question-001-original",
  attemptNumber: 1,
  retryOfQuestionId: null,
  answer: {
    id: "history-practice-answer-001-original",
    content: "我负责过一次前端性能优化，通过拆包和缓存降低了首屏时间，最终页面速度明显改善。",
    submittedAt: "2026-07-20T02:02:00.000Z",
  },
  evaluation: evaluation(
    64,
    "2026-07-20T02:03:00.000Z",
    "说明了行动方向，但缺少问题基线、取舍依据和可验证结果。",
  ),
  review: review("能够快速给出优化方向。", "缺少性能基线和量化结果。"),
  referenceAnswer: {
    status: "unavailable",
    content: null,
    reason: "generationFailed",
  },
  followUps: [],
}

const partiallyAnsweredPracticeQuestion: TrainingRecordQuestion = {
  id: "history-practice-question-002",
  prompt: "讲述一次你处理跨团队技术分歧的经历。",
  type: "behavioral",
  order: 1,
  attemptNumber: 1,
  retryOfQuestionId: null,
  assessedCapabilities: ["跨团队协作", "冲突处理"],
  isSaved: false,
  isMarkedWeak: true,
  answer: {
    id: "history-practice-answer-002",
    content:
      "两个团队对接口改造范围有分歧，我组织双方列出时间、稳定性和迁移成本，最后采用分阶段兼容方案。",
    submittedAt: "2026-07-18T08:05:00.000Z",
  },
  evaluation: evaluation(
    68,
    "2026-07-18T08:07:00.000Z",
    "给出了处理方法，但缺少个人推动过程和最终结果。",
  ),
  review: review("能够识别共同约束并提出折中方案。", "没有说明方案落地后的效果。"),
  referenceAnswer: { status: "generating", content: null },
  followUps: [
    {
      id: "history-practice-follow-up-002",
      prompt: "你如何确认这个方案获得了双方真正的承诺？",
      order: 1,
      askedAt: "2026-07-18T08:06:00.000Z",
      answer: null,
      evaluation: null,
      review: null,
      referenceAnswer: { status: "notRequested", content: null },
    },
  ],
}

const endedPracticeQuestion: TrainingRecordQuestion = {
  id: "history-practice-question-003",
  prompt: "你如何理解高级前端工程师对业务结果的责任？",
  type: "businessUnderstanding",
  order: 1,
  attemptNumber: 1,
  retryOfQuestionId: null,
  assessedCapabilities: ["业务理解", "角色认知"],
  isSaved: true,
  isMarkedWeak: true,
  answer: null,
  evaluation: null,
  review: null,
  referenceAnswer: { status: "notRequested", content: null },
  followUps: [],
}

export const targetedPracticeRecordDetailsMock = [
  {
    id: "targeted-practice-record-001",
    kind: "targetedPractice",
    status: "completed",
    startedAt: "2026-07-20T02:00:00.000Z",
    endedAt: "2026-07-20T02:15:00.000Z",
    durationSeconds: 900,
    targetRole: frontendRole,
    answeredQuestionCount: 2,
    totalQuestionCount: 2,
    overallScore: 86,
    setup: {
      questionType: "projectDeepDive",
      difficulty: "pressure",
      source: "personalized",
      prioritizedWeaknesses: true,
    },
    questions: [completedPracticeOriginalQuestion, completedPracticeQuestion],
    exposedWeaknesses: ["复杂方案的取舍说明不够充分"],
    recommendation: {
      action: "mockInterview",
      reason: "单题结构已经稳定，可以在连续问答中验证临场表达。",
      round: "technical",
      difficulty: "pressure",
      focusAreas: ["方案取舍", "跨团队协作"],
    },
  },
  {
    id: "targeted-practice-record-002",
    kind: "targetedPractice",
    status: "partiallyCompleted",
    startedAt: "2026-07-18T08:00:00.000Z",
    endedAt: "2026-07-18T08:08:00.000Z",
    durationSeconds: 480,
    targetRole: frontendRole,
    answeredQuestionCount: 1,
    totalQuestionCount: 1,
    overallScore: 68,
    setup: {
      questionType: "behavioral",
      difficulty: "basic",
      source: "history",
      prioritizedWeaknesses: false,
    },
    questions: [partiallyAnsweredPracticeQuestion],
    exposedWeaknesses: ["结果和个人贡献描述不足"],
    recommendation: {
      action: "retryQuestion",
      reason: "主问题已有有效内容，但追问尚未作答。",
      questionType: "behavioral",
      difficulty: "basic",
      focusAreas: ["推动过程", "最终结果"],
    },
  },
  {
    id: "targeted-practice-record-003",
    kind: "targetedPractice",
    status: "endedEarly",
    startedAt: "2026-07-12T01:30:00.000Z",
    endedAt: "2026-07-12T01:32:00.000Z",
    durationSeconds: 120,
    targetRole: frontendRole,
    answeredQuestionCount: 0,
    totalQuestionCount: 1,
    overallScore: null,
    setup: {
      questionType: "businessUnderstanding",
      difficulty: "basic",
      source: "saved",
      prioritizedWeaknesses: false,
    },
    questions: [endedPracticeQuestion],
    exposedWeaknesses: [],
    recommendation: null,
  },
] satisfies TargetedPracticeRecordDetailResponse[]

const interviewQuestionOne: TrainingRecordQuestion = {
  id: "history-interview-question-001",
  prompt: "请用三分钟介绍你的经历，以及它与目标岗位的匹配点。",
  type: "selfIntroduction",
  order: 1,
  attemptNumber: 1,
  retryOfQuestionId: null,
  assessedCapabilities: ["信息组织", "岗位匹配"],
  isSaved: false,
  isMarkedWeak: false,
  answer: {
    id: "history-interview-answer-001",
    content:
      "我有五年前端研发经验，近两年负责复杂工作台架构和性能治理，积累了跨团队交付、稳定性建设和业务指标验证经验，这些与岗位要求的架构能力和业务意识高度匹配。",
    submittedAt: "2026-07-16T03:05:00.000Z",
  },
  evaluation: evaluation(
    81,
    "2026-07-16T03:28:00.000Z",
    "经历与岗位匹配明确，可以进一步突出差异化优势。",
  ),
  review: review("主线明确，能够主动关联岗位要求。", "差异化价值还不够突出。"),
  referenceAnswer: readyReference(
    "我会围绕与岗位最相关的两段经历展开，分别说明承担的责任、产生的结果和沉淀的能力，最后明确这些能力如何支持目标岗位。",
    "2026-07-16T03:29:00.000Z",
  ),
  followUps: [],
}

const interviewQuestionTwo: TrainingRecordQuestion = {
  id: "history-interview-question-002",
  prompt: "如果核心系统需要在一个季度内完成架构升级，你会如何制定计划？",
  type: "technicalOrBusiness",
  order: 2,
  attemptNumber: 1,
  retryOfQuestionId: null,
  assessedCapabilities: ["架构规划", "风险控制", "协作推进"],
  isSaved: true,
  isMarkedWeak: true,
  answer: {
    id: "history-interview-answer-002",
    content:
      "我会先建立现状基线和目标指标，按依赖与风险划分迁移批次，优先改造可独立验证的边界，同时补齐监控、灰度和回滚机制。",
    submittedAt: "2026-07-16T03:14:00.000Z",
  },
  evaluation: evaluation(
    78,
    "2026-07-16T03:28:30.000Z",
    "整体路径合理，但缺少季度内的里程碑和资源安排。",
  ),
  review: review("关注依赖、验证和回滚，风险意识较强。", "时间与资源规划不够具体。"),
  referenceAnswer: {
    status: "unavailable",
    content: null,
    reason: "generationFailed",
  },
  followUps: [
    {
      id: "history-interview-follow-up-001",
      prompt: "当关键依赖团队无法按期投入时，你会如何调整？",
      order: 1,
      askedAt: "2026-07-16T03:15:00.000Z",
      answer: {
        id: "history-interview-follow-up-answer-001",
        content:
          "我会重新识别关键路径，优先推进本团队可控的适配层和验证工具，同时与依赖团队确认最小交付边界并同步风险。",
        submittedAt: "2026-07-16T03:18:00.000Z",
      },
      evaluation: evaluation(
        76,
        "2026-07-16T03:28:40.000Z",
        "应对方向合理，还可以说明升级决策的触发条件。",
      ),
      review: review("能区分可控工作和外部依赖。", "没有明确何时需要调整总体目标。"),
      referenceAnswer: { status: "generating", content: null },
    },
  ],
}

const unansweredInterviewQuestion: TrainingRecordQuestion = {
  id: "history-interview-question-003",
  prompt: "请说明你如何处理一次上线事故。",
  type: "behavioral",
  order: 2,
  attemptNumber: 1,
  retryOfQuestionId: null,
  assessedCapabilities: ["应急处理", "复盘改进"],
  isSaved: false,
  isMarkedWeak: true,
  answer: null,
  evaluation: null,
  review: null,
  referenceAnswer: {
    status: "unavailable",
    content: null,
    reason: "insufficientContext",
  },
  followUps: [],
}

const unansweredInterviewFollowUp = {
  id: "history-interview-follow-up-002",
  prompt: "你如何验证这些用户证据足以支持最终方案？",
  order: 1,
  askedAt: "2026-07-10T06:07:00.000Z",
  answer: null,
  evaluation: null,
  review: null,
  referenceAnswer: { status: "notRequested", content: null },
} satisfies TrainingRecordQuestion["followUps"][number]

const unavailableReviewInterviewQuestion: TrainingRecordQuestion = {
  ...unansweredInterviewQuestion,
  id: "history-interview-question-005",
  order: 1,
  prompt: "当你需要快速理解一个陌生业务时，会从哪些信息开始？",
  assessedCapabilities: ["业务理解", "信息分析"],
  referenceAnswer: readyReference(
    "我会先明确业务目标、核心用户和关键流程，再结合指标、用户反馈与一线访谈建立问题地图，最后用小范围验证校准判断。",
    "2026-07-08T01:04:00.000Z",
  ),
}

export const mockInterviewRecordDetailsMock = [
  {
    id: "mock-interview-record-001",
    kind: "mockInterview",
    status: "completed",
    completionReason: "formalQuestionsCompleted",
    startedAt: "2026-07-16T03:00:00.000Z",
    endedAt: "2026-07-16T03:30:00.000Z",
    durationSeconds: 1800,
    targetRole: frontendRole,
    answeredQuestionCount: 2,
    totalQuestionCount: 2,
    overallScore: 80,
    setup: {
      round: "technical",
      difficulty: "pressure",
      plannedDurationMinutes: 30,
    },
    questions: [interviewQuestionOne, interviewQuestionTwo],
    exposedWeaknesses: ["资源与里程碑规划不够具体", "差异化优势表达不足"],
    recommendation: {
      action: "targetedPractice",
      reason: "需要单独强化架构规划中的资源、节奏和升级条件。",
      questionType: "technicalOrBusiness",
      difficulty: "pressure",
      focusAreas: ["里程碑规划", "资源协调"],
    },
    overallReview: {
      status: "complete",
      content: {
        summary: "整体回答稳定，技术判断和风险意识较好，但复杂计划的节奏表达仍需加强。",
        mainStrengths: ["技术方案有清晰边界", "能够主动说明验证和回滚"],
        frequentIssues: ["资源安排缺乏具体依据"],
        riskPoints: ["受追问时容易遗漏升级条件"],
        communicationSuggestions: ["先给结论，再按里程碑展开"],
        preparationSuggestions: ["准备一个完整的跨团队架构升级案例"],
        generatedAt: "2026-07-16T03:29:30.000Z",
      },
    },
    candidateQuestionExchanges: [
      {
        id: "history-candidate-question-001",
        question: "团队如何衡量前端架构工作的业务价值？",
        interviewerAnswer: "团队会结合交付效率、稳定性、用户体验和核心业务指标综合评估。",
        feedback: "问题能够帮助判断团队的工程文化和结果导向。",
        submittedAt: "2026-07-16T03:25:00.000Z",
      },
    ],
  },
  {
    id: "mock-interview-record-002",
    kind: "mockInterview",
    status: "endedEarly",
    completionReason: "userEndedEarly",
    startedAt: "2026-07-10T06:00:00.000Z",
    endedAt: "2026-07-10T06:12:00.000Z",
    durationSeconds: 720,
    targetRole: productRole,
    answeredQuestionCount: 1,
    totalQuestionCount: 2,
    overallScore: null,
    setup: {
      round: "manager",
      difficulty: "basic",
      plannedDurationMinutes: 30,
    },
    questions: [
      {
        ...interviewQuestionOne,
        id: "history-interview-question-004",
        answer: {
          id: "history-interview-answer-004",
          content:
            "我主要负责支付产品的用户研究和流程优化，曾推动开户流程重构，并通过行为数据验证改版效果。",
          submittedAt: "2026-07-10T06:05:00.000Z",
        },
        evaluation: evaluation(
          72,
          "2026-07-10T06:11:00.000Z",
          "经历相关，但产品决策过程不够具体。",
        ),
        review: review("能够概括相关产品经历。", "用户洞察到方案决策的链路不完整。"),
        followUps: [unansweredInterviewFollowUp],
      },
      unansweredInterviewQuestion,
    ],
    exposedWeaknesses: ["产品决策证据不足"],
    recommendation: {
      action: "targetedPractice",
      reason: "先补全用户证据到产品决策的表达链路。",
      questionType: "roleCapability",
      difficulty: "basic",
      focusAreas: ["用户洞察", "决策依据"],
    },
    overallReview: {
      status: "partial",
      content: {
        summary: "本次提前结束，仅依据已回答问题生成部分复盘。",
        mainStrengths: ["相关经历清晰"],
        frequentIssues: ["决策依据不充分"],
        riskPoints: ["有效回答较少，复盘结论覆盖面有限"],
        communicationSuggestions: ["补充数据、访谈和取舍依据"],
        preparationSuggestions: ["完善开户流程重构案例"],
        generatedAt: "2026-07-10T06:11:30.000Z",
      },
    },
    candidateQuestionExchanges: [],
  },
  {
    id: "mock-interview-record-003",
    kind: "mockInterview",
    status: "endedEarly",
    completionReason: "userEndedEarly",
    startedAt: "2026-07-08T01:00:00.000Z",
    endedAt: "2026-07-08T01:01:30.000Z",
    durationSeconds: 90,
    targetRole: frontendRole,
    answeredQuestionCount: 0,
    totalQuestionCount: 1,
    overallScore: null,
    setup: {
      round: "hr",
      difficulty: "basic",
      plannedDurationMinutes: 15,
    },
    questions: [unavailableReviewInterviewQuestion],
    exposedWeaknesses: [],
    recommendation: {
      action: "mockInterview",
      reason: "有效回答不足，建议重新完成一轮短时模拟面试。",
      round: "hr",
      difficulty: "basic",
      focusAreas: ["完成回答", "业务理解"],
    },
    overallReview: {
      status: "unavailable",
      content: null,
      reason: "insufficientAnswers",
    },
    candidateQuestionExchanges: [],
  },
] satisfies MockInterviewRecordDetailResponse[]

export const trainingRecordDetailsMock = [
  ...targetedPracticeRecordDetailsMock,
  ...mockInterviewRecordDetailsMock,
]
