import type {
  PracticeDimensionScore,
  PracticeEvaluatingState,
  PracticeEvaluation,
  PracticeQuestionType,
  PracticeRecommendation,
  PracticeReview,
  PracticeScoreDimension,
} from "@/models/practice"

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
