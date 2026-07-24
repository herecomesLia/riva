import type {
  AnsweredInterviewFollowUpResponse,
  CompletedInterviewQuestionResponse,
  InterviewCandidateQuestionExchangeResponse,
  InterviewCompletedSessionResponse,
  InterviewFollowUpQuestionResponse,
  InterviewPageResponse,
  InterviewQuestionResponse,
  InterviewReviewResponse,
  InterviewSetupResponse,
} from "@/models/interview"

export type InterviewMockScenario = "setupReady" | "noTargetRoles" | "completed"

export const interviewSetupResponseMock = {
  targetRoles: [
    {
      id: "role_frontend_engineer_bytedance",
      title: "高级前端工程师",
      company: "字节跳动",
      supportedRounds: ["hr", "firstBusiness", "technical", "manager", "final", "comprehensive"],
    },
    {
      id: "role_product_manager_fintech",
      title: "金融科技产品经理",
      company: "蚂蚁集团",
      supportedRounds: ["hr", "firstBusiness", "manager", "final", "comprehensive"],
    },
  ],
  defaultConfiguration: {
    targetRoleId: "role_frontend_engineer_bytedance",
    round: "technical",
    difficulty: "pressure",
  },
} satisfies InterviewSetupResponse

const interviewQuestionSet = [
  {
    id: "interview-question-self-introduction",
    prompt: "请你用两分钟做一下自我介绍，并重点说明与高级前端工程师岗位最相关的经历。",
    type: "selfIntroduction",
    assessedCapabilities: ["信息组织", "岗位匹配", "表达重点"],
    order: 1,
  },
  {
    id: "interview-question-project-deep-dive",
    prompt: "请介绍一次你主导的前端性能优化，说明你如何定位问题、选择方案并验证结果。",
    type: "projectDeepDive",
    assessedCapabilities: ["问题分析", "技术决策", "结果量化"],
    order: 2,
  },
  {
    id: "interview-question-motivation",
    prompt: "为什么选择这个岗位？你希望未来两年在哪些能力上形成明显优势？",
    type: "motivation",
    assessedCapabilities: ["求职动机", "职业规划", "岗位理解"],
    order: 3,
  },
] satisfies InterviewQuestionResponse[]

export function createInterviewQuestionSet(): InterviewQuestionResponse[] {
  return structuredClone(interviewQuestionSet)
}

export const projectFollowUpQuestionMock = {
  id: "interview-follow-up-project-tradeoff",
  parentQuestionId: "interview-question-project-deep-dive",
  prompt: "如果监控数据只能证明性能改善，却无法直接证明业务收益，你会如何补充验证？",
  order: 1,
  createdAt: "2026-07-24T02:04:00.000Z",
} as const satisfies InterviewFollowUpQuestionResponse

export function createCandidateQuestionExchange(
  content: string,
  order: number,
): InterviewCandidateQuestionExchangeResponse {
  return {
    question: {
      id: `candidate-question-${order}`,
      content,
      submittedAt: `2026-07-24T02:${String(10 + order).padStart(2, "0")}:00.000Z`,
    },
    interviewerAnswer:
      "这个岗位会与推荐、搜索和交易团队长期协作。入职后的首要目标是熟悉核心链路，并逐步承担跨团队技术项目。",
    feedback: {
      summary: "问题聚焦岗位协作和入职目标，能够帮助候选人判断实际工作边界。",
      strengths: ["关注真实职责", "体现长期投入意愿"],
      improvementSuggestions: ["可以进一步询问前六个月的具体成功标准"],
      suggestedAlternatives: ["这个岗位入职六个月后，团队通常用哪些结果判断工作是否达到预期？"],
    },
  }
}

export function createInterviewReview(
  questions: readonly InterviewQuestionResponse[] = interviewQuestionSet,
): InterviewReviewResponse {
  return {
    overallScore: 82,
    overallPerformance:
      "整体表达清晰，项目经历与岗位要求匹配度较高；技术决策有依据，但业务价值和跨团队影响还可以进一步量化。",
    dimensionScores: [
      {
        dimension: "relevance",
        score: 88,
        explanation: "大部分回答紧扣问题，并能关联目标岗位。",
      },
      {
        dimension: "structure",
        score: 84,
        explanation: "回答有明确顺序，个别追问中的结论可以更早给出。",
      },
      {
        dimension: "specificity",
        score: 78,
        explanation: "技术细节充分，但部分业务结果缺少对照数据。",
      },
      {
        dimension: "personalContribution",
        score: 85,
        explanation: "能够说明个人决策和推动动作。",
      },
      {
        dimension: "resultsAndEvidence",
        score: 76,
        explanation: "性能结果可信，业务收益仍需更完整的归因证据。",
      },
      {
        dimension: "roleAlignment",
        score: 86,
        explanation: "经历与高级前端工程师的核心职责较为匹配。",
      },
      {
        dimension: "communication",
        score: 82,
        explanation: "表达自然稳定，少量背景信息可以压缩。",
      },
      {
        dimension: "riskControl",
        score: 79,
        explanation: "能够讨论灰度方案，但异常回滚指标可以更具体。",
      },
    ],
    questionReviews: questions.map((question, index) => ({
      questionId: question.id,
      score: [84, 81, 80][index] ?? 80,
      summary:
        index === 1
          ? "完整说明了性能优化过程，技术取舍清楚，业务验证仍可加强。"
          : "回答与问题相关，结构清晰，并能联系岗位要求。",
      strengths: index === 1 ? ["定位过程完整", "方案取舍具体"] : ["重点明确", "表达连贯"],
      issues: index === 1 ? ["业务收益缺少对照验证"] : ["部分结论可以提供更多证据"],
    })),
    mainStrengths: ["能够把复杂技术问题讲清楚", "个人贡献和决策过程较明确", "岗位动机真实具体"],
    frequentIssues: ["业务结果量化不足", "个别回答背景铺垫偏长"],
    exposedWeaknesses: ["技术项目的业务归因", "跨团队影响力表达"],
    riskPoints: ["如果被持续追问业务价值，目前证据链不够完整"],
    communicationSuggestions: ["先给结论，再补充背景和取舍", "使用对照数据说明改动前后的业务变化"],
    preparationSuggestions: [
      "补充性能指标与业务指标的关联材料",
      "准备一个跨团队推动项目的完整案例",
    ],
    nextTraining: {
      action: "targetedPractice",
      reason: "下一步应集中训练项目业务价值和量化结果的表达。",
      focusAreas: ["结果量化", "业务归因", "跨团队协作"],
      questionType: "projectDeepDive",
      difficulty: "pressure",
    },
    generatedAt: "2026-07-24T02:20:00.000Z",
  }
}

function createCompletedQuestionRecords(): CompletedInterviewQuestionResponse[] {
  const questions = createInterviewQuestionSet()
  const projectFollowUp: AnsweredInterviewFollowUpResponse = {
    status: "answered",
    question: structuredClone(projectFollowUpQuestionMock),
    answer: {
      id: "interview-answer-follow-up-1",
      content: "我会补充灰度分组和同期对照，观察核心转化链路并排除营销活动等外部因素。",
      submittedAt: "2026-07-24T02:08:00.000Z",
    },
  }

  return questions.map((question, index) => ({
    question,
    answer: {
      id: `interview-answer-${index + 1}`,
      content: [
        "我过去五年主要负责复杂业务的前端架构和性能治理，最近两年主导了核心交易链路升级。",
        "我先通过真实用户监控定位长任务和资源瀑布，再分阶段实施拆包、预加载和渲染调度优化。",
        "这个岗位的业务复杂度和技术挑战与我的经验高度匹配，我希望进一步提升架构和团队影响力。",
      ][index]!,
      submittedAt: `2026-07-24T02:0${index * 3 + 2}:00.000Z`,
    },
    followUps: index === 1 ? [projectFollowUp] : [],
    completedAt: `2026-07-24T02:0${index * 3 + 3}:00.000Z`,
  }))
}

function createCompletedSession(): InterviewCompletedSessionResponse {
  const completedQuestions = createCompletedQuestionRecords()
  const candidateQuestionExchanges = [
    createCandidateQuestionExchange("这个岗位入职后的核心目标和主要协作团队分别是什么？", 1),
  ]

  return {
    status: "completed",
    sessionId: "mock-interview-session-completed",
    version: 10,
    configuration: {
      targetRoleId: "role_frontend_engineer_bytedance",
      round: "technical",
      difficulty: "pressure",
    },
    startedAt: "2026-07-24T02:00:00.000Z",
    progress: {
      completedQuestions: completedQuestions.length,
      totalQuestions: completedQuestions.length,
    },
    completedQuestions,
    completedAt: "2026-07-24T02:18:00.000Z",
    candidateQuestionExchanges,
    review: createInterviewReview(completedQuestions.map(({ question }) => question)),
  }
}

export function createInterviewMockResponse(
  scenario: InterviewMockScenario = "setupReady",
): InterviewPageResponse {
  if (scenario === "noTargetRoles") {
    return {
      setup: {
        targetRoles: [],
        defaultConfiguration: {
          targetRoleId: null,
          round: "comprehensive",
          difficulty: "basic",
        },
      },
      session: null,
    }
  }

  if (scenario === "completed") {
    return {
      setup: structuredClone(interviewSetupResponseMock),
      session: createCompletedSession(),
    }
  }

  return {
    setup: structuredClone(interviewSetupResponseMock),
    session: null,
  }
}
