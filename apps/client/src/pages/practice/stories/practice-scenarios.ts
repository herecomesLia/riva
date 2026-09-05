import type {
  PracticeData,
  PracticeSetupContext,
  PracticeSelection,
  ActiveSelection,
  PracticeQuestion,
  PracticeAnswer,
  EvaluatingSession,
  PracticeFollowUp,
  FollowUpCompletion,
  PracticeEvaluation,
  PracticeReview,
} from "@/models/practice-workflow"

// Static display scenarios preserve the existing Storybook and component-test coverage.
const setupContext1: PracticeSetupContext = {
  targetRoles: [
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
  ],
  availableDifficulties: ["basic", "pressure"],
  eligibleQuestionCounts: {
    saved: 3,
    history: 5,
  },
}

const selection1: ActiveSelection = {
  targetRoleId: "role_frontend_bytedance",
  questionType: "projectDeepDive",
  difficulty: "basic",
  source: "personalized",
  prioritizeWeaknesses: false,
}

const setupContext2: PracticeSetupContext = {
  targetRoles: [],
  availableDifficulties: ["basic", "pressure"],
  eligibleQuestionCounts: {
    saved: 0,
    history: 0,
  },
}

const selection2: PracticeSelection = {
  targetRoleId: null,
  questionType: "projectDeepDive",
  difficulty: "basic",
  source: "personalized",
  prioritizeWeaknesses: false,
}

const setupContext3: PracticeSetupContext = {
  targetRoles: [
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
  ],
  availableDifficulties: ["basic", "pressure"],
  eligibleQuestionCounts: {
    saved: 0,
    history: 5,
  },
}

const selection3: ActiveSelection = {
  targetRoleId: "role_frontend_bytedance",
  questionType: "projectDeepDive",
  difficulty: "basic",
  source: "saved",
  prioritizeWeaknesses: false,
}

const setupContext4: PracticeSetupContext = {
  targetRoles: [
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
  ],
  availableDifficulties: ["basic", "pressure"],
  eligibleQuestionCounts: {
    saved: 3,
    history: 0,
  },
}

const selection4: ActiveSelection = {
  targetRoleId: "role_frontend_bytedance",
  questionType: "projectDeepDive",
  difficulty: "basic",
  source: "history",
  prioritizeWeaknesses: false,
}

const question1: PracticeQuestion = {
  prompt: "请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。",
  assessedCapabilities: ["问题分析", "技术决策", "跨团队协作", "结果量化"],
  recommendedMaterials: ["全球电商结算页性能优化项目", "性能监控平台建设经历"],
  hints: {
    status: "notRequested",
    content: null,
  },
  framework: {
    status: "notRequested",
    content: null,
  },
  referenceAnswer: {
    status: "notRequested",
    content: null,
    viewedBeforeSubmission: false,
  },
  isSaved: false,
  isWeak: false,
}

const question2: PracticeQuestion = {
  prompt: "请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。",
  assessedCapabilities: ["问题分析", "技术决策", "跨团队协作", "结果量化"],
  recommendedMaterials: ["全球电商结算页性能优化项目", "性能监控平台建设经历"],
  hints: {
    status: "revealed",
    content: [
      "先交代项目背景、业务目标和关键约束。",
      "明确你的个人职责，以及你实际负责解决的问题。",
      "说明关键决策、备选方案和做出取舍的依据。",
      "补充你如何推动协作方落地方案并处理阻力。",
      "用量化指标呈现结果，并说明结果如何得到验证。",
    ],
  },
  framework: {
    status: "notRequested",
    content: null,
  },
  referenceAnswer: {
    status: "notRequested",
    content: null,
    viewedBeforeSubmission: false,
  },
  isSaved: false,
  isWeak: false,
}

const question3: PracticeQuestion = {
  prompt: "请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。",
  assessedCapabilities: ["问题分析", "技术决策", "跨团队协作", "结果量化"],
  recommendedMaterials: ["全球电商结算页性能优化项目", "性能监控平台建设经历"],
  hints: {
    status: "notRequested",
    content: null,
  },
  framework: {
    status: "revealed",
    content: [
      "背景与目标：说明项目要解决的问题、目标和约束。",
      "个人职责：界定你的责任范围和需要推动的关键事项。",
      "决策与行动：展开关键判断、方案取舍和推动过程。",
      "结果与复盘：呈现量化结果、验证方式和后续改进。",
    ],
  },
  referenceAnswer: {
    status: "notRequested",
    content: null,
    viewedBeforeSubmission: false,
  },
  isSaved: false,
  isWeak: false,
}

const question4: PracticeQuestion = {
  prompt: "请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。",
  assessedCapabilities: ["问题分析", "技术决策", "跨团队协作", "结果量化"],
  recommendedMaterials: ["全球电商结算页性能优化项目", "性能监控平台建设经历"],
  hints: {
    status: "notRequested",
    content: null,
  },
  framework: {
    status: "notRequested",
    content: null,
  },
  referenceAnswer: {
    status: "notRequested",
    content: null,
    viewedBeforeSubmission: false,
  },
  isSaved: true,
  isWeak: false,
}

const question5: PracticeQuestion = {
  prompt: "请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。",
  assessedCapabilities: ["问题分析", "技术决策", "跨团队协作", "结果量化"],
  recommendedMaterials: ["全球电商结算页性能优化项目", "性能监控平台建设经历"],
  hints: {
    status: "notRequested",
    content: null,
  },
  framework: {
    status: "notRequested",
    content: null,
  },
  referenceAnswer: {
    status: "notRequested",
    content: null,
    viewedBeforeSubmission: false,
  },
  isSaved: false,
  isWeak: true,
}

const mainAnswer1: PracticeAnswer = {
  content:
    "在全球电商结算页项目中，我发现低端设备的可交互时间超过五秒。我负责拆解性能数据，定位到首屏包体和同步请求是主要瓶颈，并推动团队实施路由级拆包、接口并行和关键资源预加载。上线后，P75 可交互时间下降到三秒以内，结算页退出率下降了 8%。",
}

const followUps1: EvaluatingSession["followUps"] = []

const currentFollowUp1: PracticeFollowUp = {
  prompt: "你如何验证结果主要来自你的关键决策，而不是同期的其他变化？",
  hints: {
    status: "notRequested",
    content: null,
  },
  framework: {
    status: "notRequested",
    content: null,
  },
  referenceAnswer: {
    status: "notRequested",
    content: null,
    viewedBeforeSubmission: false,
  },
}

const selection5: ActiveSelection = {
  targetRoleId: "role_frontend_bytedance",
  questionType: "behavioral",
  difficulty: "basic",
  source: "personalized",
  prioritizeWeaknesses: false,
}

const question6: PracticeQuestion = {
  prompt: "请介绍一次你与关键协作方存在明显分歧的经历，你如何推动团队形成共识并完成目标？",
  assessedCapabilities: ["协作沟通", "冲突处理", "推动力", "复盘意识"],
  recommendedMaterials: ["跨团队项目协作经历"],
  hints: {
    status: "notRequested",
    content: null,
  },
  framework: {
    status: "notRequested",
    content: null,
  },
  referenceAnswer: {
    status: "notRequested",
    content: null,
    viewedBeforeSubmission: false,
  },
  isSaved: false,
  isWeak: false,
}

const mainAnswer2: PracticeAnswer = {
  content:
    "在一次跨团队发布中，业务方希望按原计划全量上线，但监控显示核心链路仍有风险。我先与对方确认共同目标，再用灰度数据说明影响范围，推动双方同意分阶段发布，并明确每阶段的验证指标。最终版本按期覆盖核心用户，且没有出现重大线上问题。",
}

const currentFollowUp2: PracticeFollowUp = {
  prompt: "如果重新处理这次分歧，你会调整哪一个具体行动，为什么？",
  hints: {
    status: "notRequested",
    content: null,
  },
  framework: {
    status: "notRequested",
    content: null,
  },
  referenceAnswer: {
    status: "notRequested",
    content: null,
    viewedBeforeSubmission: false,
  },
}

const followUps2: EvaluatingSession["followUps"] = [
  {
    question: {
      prompt: "你如何验证结果主要来自你的关键决策，而不是同期的其他变化？",
      hints: {
        status: "notRequested",
        content: null,
      },
      framework: {
        status: "notRequested",
        content: null,
      },
      referenceAnswer: {
        status: "notRequested",
        content: null,
        viewedBeforeSubmission: false,
      },
    },
    answer: {
      content:
        "我们按设备性能分层做了灰度对照，并保持同期产品功能一致。低端设备实验组的可交互时间和退出率同步改善，高端设备变化不显著，因此可以较有把握地判断性能优化是主要因素。",
    },
  },
]

const currentFollowUp3: PracticeFollowUp = {
  prompt: "推进性能方案时最大的分歧是什么，你具体如何促成团队达成一致？",
  hints: {
    status: "notRequested",
    content: null,
  },
  framework: {
    status: "notRequested",
    content: null,
  },
  referenceAnswer: {
    status: "notRequested",
    content: null,
    viewedBeforeSubmission: false,
  },
}

const selection6: ActiveSelection = {
  targetRoleId: "role_frontend_bytedance",
  questionType: "motivation",
  difficulty: "basic",
  source: "personalized",
  prioritizeWeaknesses: false,
}

const question7: PracticeQuestion = {
  prompt: "为什么你希望应聘当前目标岗位？请结合过往经历说明你的匹配点和下一阶段目标。",
  assessedCapabilities: ["求职动机", "岗位认知", "自我认知", "职业规划"],
  recommendedMaterials: ["与目标岗位相关的成长经历"],
  hints: {
    status: "notRequested",
    content: null,
  },
  framework: {
    status: "notRequested",
    content: null,
  },
  referenceAnswer: {
    status: "notRequested",
    content: null,
    viewedBeforeSubmission: false,
  },
  isSaved: false,
  isWeak: false,
}

const mainAnswer3: PracticeAnswer = {
  content:
    "我希望应聘这个岗位，是因为它同时需要复杂前端系统建设和跨团队推动能力。过去几年我持续负责性能治理与基础设施建设，既能解决工程问题，也能把技术结果连接到业务指标。下一阶段我希望承担更完整的技术决策责任，并帮助团队建立可持续的工程能力。",
}

const followUpCompletion1: FollowUpCompletion = {
  status: "completed",
}

const followUpCompletion2: FollowUpCompletion = {
  status: "endedEarly",
  unanswered: {
    prompt: "推进性能方案时最大的分歧是什么，你具体如何促成团队达成一致？",
    hints: {
      status: "notRequested",
      content: null,
    },
    framework: {
      status: "notRequested",
      content: null,
    },
    referenceAnswer: {
      status: "notRequested",
      content: null,
      viewedBeforeSubmission: false,
    },
  },
}

const followUps3: EvaluatingSession["followUps"] = [
  {
    question: {
      prompt: "你如何验证结果主要来自你的关键决策，而不是同期的其他变化？",
      hints: {
        status: "notRequested",
        content: null,
      },
      framework: {
        status: "notRequested",
        content: null,
      },
      referenceAnswer: {
        status: "notRequested",
        content: null,
        viewedBeforeSubmission: false,
      },
    },
    answer: {
      content:
        "我们按设备性能分层做了灰度对照，并保持同期产品功能一致。低端设备实验组的可交互时间和退出率同步改善，高端设备变化不显著，因此可以较有把握地判断性能优化是主要因素。",
    },
  },
  {
    question: {
      prompt: "推进性能方案时最大的分歧是什么，你具体如何促成团队达成一致？",
      hints: {
        status: "notRequested",
        content: null,
      },
      framework: {
        status: "notRequested",
        content: null,
      },
      referenceAnswer: {
        status: "notRequested",
        content: null,
        viewedBeforeSubmission: false,
      },
    },
    answer: {
      content:
        "我先把争议拆成包体收益、改造成本和发布风险三部分，用现网数据估算收益，再推动团队用一个低风险路由做小范围实验。实验结果达到约定阈值后，我们共同评审分阶段方案，并为每一阶段设置监控和回滚条件。",
    },
  },
]

const question8: PracticeQuestion = {
  prompt: "请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。",
  assessedCapabilities: ["问题分析", "技术决策", "跨团队协作", "结果量化"],
  recommendedMaterials: ["全球电商结算页性能优化项目", "性能监控平台建设经历"],
  hints: {
    status: "notRequested",
    content: null,
  },
  framework: {
    status: "notRequested",
    content: null,
  },
  referenceAnswer: {
    status: "revealed",
    content: {
      kind: "personalizedExample",
      answer:
        "围绕问题“请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。”，针对目标岗位“Senior Frontend Engineer”，可用材料为“全球电商结算页性能优化项目、性能监控平台建设经历”。我会选用推荐材料中的“全球电商结算页性能优化项目”来回答。项目目标是改善结算页在中低端设备上的交互体验，我负责定位前端瓶颈并推动方案落地。我先按设备与网络条件拆分性能数据，结合性能监控和调用链确认主要耗时来自首屏包体与非关键请求竞争。评估整包重构和渐进优化后，我选择先拆分非关键模块、调整请求优先级，并与产品和服务端共同确定灰度范围。上线时按设备分层观察 P75 可交互时间、退出率和异常率，用灰度组与对照组验证变化；结果以项目已有监控数据为准。复盘时我会补充说明方案的适用边界、回滚信号，以及后续如何把一次优化沉淀成持续监控机制。",
      keyPoints: [
        "界定个人职责与业务目标",
        "用分层数据定位瓶颈并解释取舍",
        "通过灰度对照和监控验证结果",
      ],
      commonMistakes: ["只罗列团队动作，没有说明个人判断", "编造项目中不存在的指标或成果"],
    },
    viewedBeforeSubmission: false,
  },
  isSaved: false,
  isWeak: false,
}

const followUps4: EvaluatingSession["followUps"] = [
  {
    question: {
      prompt: "你如何验证结果主要来自你的关键决策，而不是同期的其他变化？",
      hints: {
        status: "notRequested",
        content: null,
      },
      framework: {
        status: "notRequested",
        content: null,
      },
      referenceAnswer: {
        status: "revealed",
        content: {
          kind: "personalizedSupplement",
          addressedGap: "结果归因证据不足，尚未排除同期变化的影响。",
          answer:
            "针对目标岗位“Senior Frontend Engineer”和主问题“请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。”，用户主回答为“在全球电商结算页项目中，我发现低端设备的可交互时间超过五秒。我负责拆解性能数据，定位到首屏包体和同步请求是主要瓶颈，并推动团队实施路由级拆包、接口并行和关键资源预加载。上线后，P75 可交互时间下降到三秒以内，结算页退出率下降了 8%。”；当前追问为“你如何验证结果主要来自你的关键决策，而不是同期的其他变化？”。推荐材料是“全球电商结算页性能优化项目、性能监控平台建设经历”。这是本题第一道追问，补充时应直接承接主回答。可以基于真实项目补充：先列出上线同期可能影响结果的产品、流量或服务端变化，再说明你实际采用的灰度、设备分层、时间窗口或对照组。对比关键决策覆盖与未覆盖人群的指标变化，并明确哪些结果可以合理归因、哪些仍只能视为相关性；如没有严格实验，应坦诚证据边界，而不是补造指标。",
          keyPoints: ["识别同期干扰因素", "使用可复核的对照证据", "区分相关性与因果归因"],
          commonMistakes: ["只重复最终指标", "把团队整体结果全部归为个人贡献", "虚构实验或数据"],
        },
        viewedBeforeSubmission: false,
      },
    },
    answer: {
      content:
        "我们按设备性能分层做了灰度对照，并保持同期产品功能一致。低端设备实验组的可交互时间和退出率同步改善，高端设备变化不显著，因此可以较有把握地判断性能优化是主要因素。",
    },
  },
  {
    question: {
      prompt: "推进性能方案时最大的分歧是什么，你具体如何促成团队达成一致？",
      hints: {
        status: "notRequested",
        content: null,
      },
      framework: {
        status: "notRequested",
        content: null,
      },
      referenceAnswer: {
        status: "revealed",
        content: {
          kind: "personalizedSupplement",
          addressedGap: "缺少推动性能方案落地时的个人协作动作。",
          answer:
            "针对目标岗位“Senior Frontend Engineer”和主问题“请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。”，用户主回答为“在全球电商结算页项目中，我发现低端设备的可交互时间超过五秒。我负责拆解性能数据，定位到首屏包体和同步请求是主要瓶颈，并推动团队实施路由级拆包、接口并行和关键资源预加载。上线后，P75 可交互时间下降到三秒以内，结算页退出率下降了 8%。”；当前追问为“推进性能方案时最大的分歧是什么，你具体如何促成团队达成一致？”。推荐材料是“全球电商结算页性能优化项目、性能监控平台建设经历”。此前追问回答为：“你如何验证结果主要来自你的关键决策，而不是同期的其他变化？”→“我们按设备性能分层做了灰度对照，并保持同期产品功能一致。低端设备实验组的可交互时间和退出率同步改善，高端设备变化不显著，因此可以较有把握地判断性能优化是主要因素。”。补充时应承接已有信息，避免重复。可以从真实分歧切入，例如性能收益与改造成本、发布时间或稳定性之间的取舍。补充你如何把争论拆成可验证问题，使用已有监控或低风险试点降低不确定性，并与相关方提前约定成功指标、灰度范围和回滚条件。最后说明形成了什么共识以及你个人负责了哪一段推动工作。",
          keyPoints: ["具体利益相关方和诉求", "用证据缩小分歧", "明确个人推动与共同决策"],
          commonMistakes: ["只说加强沟通", "把协作方描述成阻碍者", "省略方案代价与风险"],
        },
        viewedBeforeSubmission: false,
      },
    },
    answer: {
      content:
        "我先把争议拆成包体收益、改造成本和发布风险三部分，用现网数据估算收益，再推动团队用一个低风险路由做小范围实验。实验结果达到约定阈值后，我们共同评审分阶段方案，并为每一阶段设置监控和回滚条件。",
    },
  },
]

const evaluation1: PracticeEvaluation = {
  overallScore: 85,
  dimensionScores: [
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
  ],
}

const review1: PracticeReview = {
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
}

const review2: PracticeReview = {
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
}

const evaluation2: PracticeEvaluation = {
  overallScore: 94,
  dimensionScores: [
    {
      dimension: "relevance",
      score: 98,
      explanation: "回答始终围绕性能优化经历展开，与问题高度相关。",
    },
    {
      dimension: "structure",
      score: 92,
      explanation: "背景、行动和结果清楚，但关键决策的层次还可以更突出。",
    },
    {
      dimension: "specificity",
      score: 96,
      explanation: "给出了瓶颈、优化动作和设备分层等具体信息。",
    },
    {
      dimension: "personalContribution",
      score: 90,
      explanation: "说明了个人负责定位和推动，但跨团队影响方式还不够具体。",
    },
    {
      dimension: "resultsAndEvidence",
      score: 100,
      explanation: "使用 P75 指标、退出率和灰度对照支撑结果。",
    },
    {
      dimension: "roleAlignment",
      score: 94,
      explanation: "体现了高级前端岗位需要的性能治理和协作能力。",
    },
    {
      dimension: "communication",
      score: 91,
      explanation: "表达简洁清楚，可以进一步强调最关键的取舍。",
    },
    {
      dimension: "riskControl",
      score: 86,
      explanation: "提到了灰度验证，但没有说明回滚条件和监控告警。",
    },
  ],
}

const review3: PracticeReview = {
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
}

const evaluation3: PracticeEvaluation = {
  overallScore: 58,
  dimensionScores: [
    {
      dimension: "relevance",
      score: 63,
      explanation: "回答始终围绕性能优化经历展开，与问题高度相关。",
    },
    {
      dimension: "structure",
      score: 57,
      explanation: "背景、行动和结果清楚，但关键决策的层次还可以更突出。",
    },
    {
      dimension: "specificity",
      score: 61,
      explanation: "给出了瓶颈、优化动作和设备分层等具体信息。",
    },
    {
      dimension: "personalContribution",
      score: 55,
      explanation: "说明了个人负责定位和推动，但跨团队影响方式还不够具体。",
    },
    {
      dimension: "resultsAndEvidence",
      score: 65,
      explanation: "使用 P75 指标、退出率和灰度对照支撑结果。",
    },
    {
      dimension: "roleAlignment",
      score: 59,
      explanation: "体现了高级前端岗位需要的性能治理和协作能力。",
    },
    {
      dimension: "communication",
      score: 56,
      explanation: "表达简洁清楚，可以进一步强调最关键的取舍。",
    },
    {
      dimension: "riskControl",
      score: 51,
      explanation: "提到了灰度验证，但没有说明回滚条件和监控告警。",
    },
  ],
}

const review4: PracticeReview = {
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
}

const review5: PracticeReview = {
  overallPerformance:
    "回答能够从业务影响切入，逐步说明问题定位、方案设计、跨团队推动和结果验证，整体叙述具有较好的完整性。当前最需要继续加强的是把每一次关键判断和候选人本人的具体动作建立更直接的对应关系，并明确说明灰度阶段观察了哪些指标、如何设置告警阈值、什么情况下启动回滚，以及这些机制如何帮助团队在控制发布风险的同时验证性能收益。",
  highlights: ["用 P75 可交互时间和退出率呈现业务结果", "通过设备分层灰度增强归因可信度"],
  mainIssues: ["团队分歧处理过程还可以补充更具体的个人沟通动作", "风险控制仍缺少持续监控细节"],
  improvementSuggestions: [
    "将推动过程拆成发现分歧、澄清约束、提出可验证方案和促成决策四个连续动作，并分别说明你提供了什么信息、影响了哪位协作方以及最终形成了什么共识。",
    "把结果验证补充为优化前基线、实验组与对照组差异、持续观察周期、异常告警阈值和回滚条件，避免只用一个上线后的最终指标概括全部验证过程。",
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
}

const review6: PracticeReview = {
  overallPerformance: "回答结构完整，证据充分，已经能够清楚展示性能治理能力和个人贡献。",
  highlights: ["问题定位过程具体", "个人决策清晰", "结果与归因证据完整"],
  mainIssues: ["可以进一步压缩背景描述，让核心行动更突出"],
  improvementSuggestions: ["将背景控制在两句话内，优先呈现关键判断和取舍"],
  reusableAnswerStructure: ["业务问题", "数据定位", "关键取舍", "推动落地", "结果验证"],
  exposedWeaknesses: [],
  recommendation: {
    action: "nextQuestion",
    reason: "当前题已覆盖项目深挖的核心要求，下一题可继续训练高压场景下的技术取舍。",
    nextQuestion: {
      questionType: "projectDeepDive",
      difficulty: "pressure",
      focusAreas: ["技术取舍", "风险控制"],
    },
  },
}

const question9: PracticeQuestion = {
  prompt: "为什么你希望应聘当前目标岗位？请结合过往经历说明你的匹配点和下一阶段目标。",
  assessedCapabilities: ["求职动机", "岗位认知", "自我认知", "职业规划"],
  recommendedMaterials: ["与目标岗位相关的成长经历"],
  hints: {
    status: "notRequested",
    content: null,
  },
  framework: {
    status: "notRequested",
    content: null,
  },
  referenceAnswer: {
    status: "revealed",
    content: {
      kind: "personalizedExample",
      answer:
        "围绕问题“为什么你希望应聘当前目标岗位？请结合过往经历说明你的匹配点和下一阶段目标。”，针对目标岗位“Senior Frontend Engineer”，可用材料为“与目标岗位相关的成长经历”。我希望应聘当前目标岗位，是因为岗位同时要求复杂问题分析、工程化建设和跨团队推动，这与我在性能优化及监控平台建设中的积累直接相连。过去的经历让我确认，我最有动力解决的不是单个页面问题，而是把定位方法、质量标准和协作机制沉淀为团队可复用的能力。基于当前可用材料，我能贡献的是性能治理、前端基础设施设计和用证据推动技术决策的经验。下一阶段我希望承担更完整的决策责任，但不会把尚未经历过的业务或成果包装成既有经验；我会坦诚说明能力边界和入职后的学习计划。",
      keyPoints: [
        "把岗位吸引力与真实经历连接",
        "说明可贡献价值和下一阶段目标",
        "坦诚能力边界与学习计划",
      ],
      commonMistakes: ["只表达对公司或技术的泛泛兴趣", "用虚构经历证明岗位匹配"],
    },
    viewedBeforeSubmission: false,
  },
  isSaved: false,
  isWeak: false,
}

const evaluation4: PracticeEvaluation = {
  overallScore: 86,
  dimensionScores: [
    {
      dimension: "relevance",
      score: 90,
      explanation: "回答始终围绕选择岗位的动机和匹配关系展开。",
    },
    {
      dimension: "structure",
      score: 85,
      explanation: "过往经历、可带来的价值和职业目标的结构清楚。",
    },
    {
      dimension: "specificity",
      score: 84,
      explanation: "给出了真实经历连接，但可以再补充一个具体成果。",
    },
    {
      dimension: "personalContribution",
      score: 82,
      explanation: "说明了自己在相关经历中承担的责任。",
    },
    {
      dimension: "resultsAndEvidence",
      score: 78,
      explanation: "有经历证据支撑，但量化结果还可以更充分。",
    },
    {
      dimension: "roleAlignment",
      score: 91,
      explanation: "清楚说明了过往能力与目标岗位的连接。",
    },
    {
      dimension: "communication",
      score: 88,
      explanation: "表达自然，有明确的职业发展逻辑。",
    },
    {
      dimension: "riskControl",
      score: 76,
      explanation: "可补充对岗位挑战和自身准备边界的理解。",
    },
  ],
}

const review7: PracticeReview = {
  overallPerformance: "回答清楚连接了过往经历、目标岗位和下一阶段职业目标，岗位动机具有可信度。",
  highlights: ["说明了经历与岗位能力的直接连接", "职业发展目标具体且一致"],
  mainIssues: ["可增加一个具体成果来证明能带来的价值", "可补充对岗位挑战的理解"],
  improvementSuggestions: ["用一项真实成果说明可交付的价值", "说明你希望解决的岗位问题和准备方式"],
  reusableAnswerStructure: [
    "选择岗位的原因",
    "相关经历连接",
    "可带来的价值",
    "岗位理解",
    "职业发展目标",
  ],
  exposedWeaknesses: ["结果与证据支撑", "岗位挑战认知"],
  recommendation: {
    action: "nextQuestion",
    reason: "本题回答较完整，可以在相同题型下继续强化当前暴露的薄弱项。",
    nextQuestion: {
      questionType: "motivation",
      difficulty: "basic",
      focusAreas: ["结果与证据支撑", "岗位挑战认知"],
    },
  },
}

const followUps5: EvaluatingSession["followUps"] = [
  {
    question: {
      prompt: "你如何验证结果主要来自你的关键决策，而不是同期的其他变化？",
      hints: {
        status: "notRequested",
        content: null,
      },
      framework: {
        status: "notRequested",
        content: null,
      },
      referenceAnswer: {
        status: "revealed",
        content: {
          kind: "personalizedSupplement",
          addressedGap: "结果归因证据不足，尚未排除同期变化的影响。",
          answer:
            "针对目标岗位“Senior Frontend Engineer”和主问题“请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。”，用户主回答为“在全球电商结算页项目中，我发现低端设备的可交互时间超过五秒。我负责拆解性能数据，定位到首屏包体和同步请求是主要瓶颈，并推动团队实施路由级拆包、接口并行和关键资源预加载。上线后，P75 可交互时间下降到三秒以内，结算页退出率下降了 8%。”；当前追问为“你如何验证结果主要来自你的关键决策，而不是同期的其他变化？”。推荐材料是“全球电商结算页性能优化项目、性能监控平台建设经历”。这是本题第一道追问，补充时应直接承接主回答。可以基于真实项目补充：先列出上线同期可能影响结果的产品、流量或服务端变化，再说明你实际采用的灰度、设备分层、时间窗口或对照组。对比关键决策覆盖与未覆盖人群的指标变化，并明确哪些结果可以合理归因、哪些仍只能视为相关性；如没有严格实验，应坦诚证据边界，而不是补造指标。",
          keyPoints: ["识别同期干扰因素", "使用可复核的对照证据", "区分相关性与因果归因"],
          commonMistakes: ["只重复最终指标", "把团队整体结果全部归为个人贡献", "虚构实验或数据"],
        },
        viewedBeforeSubmission: false,
      },
    },
    answer: {
      content:
        "我们按设备性能分层做了灰度对照，并保持同期产品功能一致。低端设备实验组的可交互时间和退出率同步改善，高端设备变化不显著，因此可以较有把握地判断性能优化是主要因素。",
    },
  },
]

const followUpCompletion3: FollowUpCompletion = {
  status: "endedEarly",
  unanswered: {
    prompt: "推进性能方案时最大的分歧是什么，你具体如何促成团队达成一致？",
    hints: {
      status: "notRequested",
      content: null,
    },
    framework: {
      status: "notRequested",
      content: null,
    },
    referenceAnswer: {
      status: "revealed",
      content: {
        kind: "personalizedSupplement",
        addressedGap: "缺少推动性能方案落地时的个人协作动作。",
        answer:
          "针对目标岗位“Senior Frontend Engineer”和主问题“请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。”，用户主回答为“在全球电商结算页项目中，我发现低端设备的可交互时间超过五秒。我负责拆解性能数据，定位到首屏包体和同步请求是主要瓶颈，并推动团队实施路由级拆包、接口并行和关键资源预加载。上线后，P75 可交互时间下降到三秒以内，结算页退出率下降了 8%。”；当前追问为“推进性能方案时最大的分歧是什么，你具体如何促成团队达成一致？”。推荐材料是“全球电商结算页性能优化项目、性能监控平台建设经历”。此前追问回答为：“你如何验证结果主要来自你的关键决策，而不是同期的其他变化？”→“我们按设备性能分层做了灰度对照，并保持同期产品功能一致。低端设备实验组的可交互时间和退出率同步改善，高端设备变化不显著，因此可以较有把握地判断性能优化是主要因素。”。补充时应承接已有信息，避免重复。可以从真实分歧切入，例如性能收益与改造成本、发布时间或稳定性之间的取舍。补充你如何把争论拆成可验证问题，使用已有监控或低风险试点降低不确定性，并与相关方提前约定成功指标、灰度范围和回滚条件。最后说明形成了什么共识以及你个人负责了哪一段推动工作。",
        keyPoints: ["具体利益相关方和诉求", "用证据缩小分歧", "明确个人推动与共同决策"],
        commonMistakes: ["只说加强沟通", "把协作方描述成阻碍者", "省略方案代价与风险"],
      },
      viewedBeforeSubmission: false,
    },
  },
}

const evaluation5: PracticeEvaluation = {
  overallScore: 73,
  dimensionScores: [
    {
      dimension: "relevance",
      score: 78,
      explanation: "回答始终围绕性能优化经历展开，与问题高度相关。",
    },
    {
      dimension: "structure",
      score: 72,
      explanation: "背景、行动和结果清楚，但关键决策的层次还可以更突出。",
    },
    {
      dimension: "specificity",
      score: 76,
      explanation: "给出了瓶颈、优化动作和设备分层等具体信息。",
    },
    {
      dimension: "personalContribution",
      score: 70,
      explanation: "说明了个人负责定位和推动，但跨团队影响方式还不够具体。",
    },
    {
      dimension: "resultsAndEvidence",
      score: 80,
      explanation: "使用 P75 指标、退出率和灰度对照支撑结果。",
    },
    {
      dimension: "roleAlignment",
      score: 74,
      explanation: "体现了高级前端岗位需要的性能治理和协作能力。",
    },
    {
      dimension: "communication",
      score: 71,
      explanation: "表达简洁清楚，可以进一步强调最关键的取舍。",
    },
    {
      dimension: "riskControl",
      score: 66,
      explanation: "提到了灰度验证，但没有完整说明回滚条件和监控告警。",
    },
  ],
}

const review8: PracticeReview = {
  overallPerformance:
    "回答有清晰的性能优化主线和量化结果，能够说明关键决策和个人贡献。 本题追问提前结束，证据和取舍信息尚未完整补充。",
  highlights: ["用 P75 可交互时间和退出率呈现业务结果", "通过设备分层灰度增强归因可信度"],
  mainIssues: [
    "跨团队影响方式还可以补充更具体的个人沟通动作",
    "未回答追问未补充：推进性能方案时最大的分歧是什么，你具体如何促成团队达成一致？",
  ],
  improvementSuggestions: [
    "补充推动拆包方案达成一致的关键沟通动作",
    "说明监控告警和回滚预案",
    "重新回答时补齐当前追问要求的证据、取舍或风险信息。",
  ],
  reusableAnswerStructure: ["业务影响", "数据定位", "个人决策", "推动落地", "结果验证", "风险复盘"],
  exposedWeaknesses: ["个人影响力表达", "风险控制", "追问证据完整性"],
  recommendation: {
    action: "retryCurrent",
    reason: "当前追问提前结束，建议补齐未回答的关键信息后重答本题。",
  },
}

const scenarios = {
  setupReady: { setupContext: setupContext1, session: { status: "setup", selection: selection1 } },
  noRoles: { setupContext: setupContext2, session: { status: "setup", selection: selection2 } },
  noEligibleSavedQuestions: {
    setupContext: setupContext3,
    session: { status: "setup", selection: selection3 },
  },
  noEligibleHistoryQuestions: {
    setupContext: setupContext4,
    session: { status: "setup", selection: selection4 },
  },
  generatingQuestion: {
    setupContext: setupContext1,
    session: { status: "generatingQuestion", selection: selection1 },
  },
  answeringQuestion: {
    setupContext: setupContext1,
    session: {
      status: "answering",
      selection: selection1,
      question: question1,
      assistedRetry: false,
    },
  },
  answeringHintRevealed: {
    setupContext: setupContext1,
    session: {
      status: "answering",
      selection: selection1,
      question: question2,
      assistedRetry: false,
    },
  },
  answeringFrameworkRevealed: {
    setupContext: setupContext1,
    session: {
      status: "answering",
      selection: selection1,
      question: question3,
      assistedRetry: false,
    },
  },
  answeringSavedQuestion: {
    setupContext: setupContext1,
    session: {
      status: "answering",
      selection: selection1,
      question: question4,
      assistedRetry: false,
    },
  },
  answeringWeakQuestion: {
    setupContext: setupContext1,
    session: {
      status: "answering",
      selection: selection1,
      question: question5,
      assistedRetry: false,
    },
  },
  answeringFirstFollowUp: {
    setupContext: setupContext1,
    session: {
      status: "answeringFollowUp",
      selection: selection1,
      question: question1,
      mainAnswer: mainAnswer1,
      followUps: followUps1,
      currentFollowUp: currentFollowUp1,
    },
  },
  answeringSingleFollowUp: {
    setupContext: setupContext1,
    session: {
      status: "answeringFollowUp",
      selection: selection5,
      question: question6,
      mainAnswer: mainAnswer2,
      followUps: followUps1,
      currentFollowUp: currentFollowUp2,
    },
  },
  answeringFollowUp: {
    setupContext: setupContext1,
    session: {
      status: "answeringFollowUp",
      selection: selection1,
      question: question1,
      mainAnswer: mainAnswer1,
      followUps: followUps2,
      currentFollowUp: currentFollowUp3,
    },
  },
  evaluatingNoFollowUp: {
    setupContext: setupContext1,
    session: {
      status: "evaluating",
      selection: selection6,
      question: question7,
      mainAnswer: mainAnswer3,
      followUps: followUps1,
      followUpCompletion: followUpCompletion1,
    },
  },
  evaluatingFollowUpEndedEarly: {
    setupContext: setupContext1,
    session: {
      status: "evaluating",
      selection: selection1,
      question: question1,
      mainAnswer: mainAnswer1,
      followUps: followUps2,
      followUpCompletion: followUpCompletion2,
    },
  },
  evaluatingAnswer: {
    setupContext: setupContext1,
    session: {
      status: "evaluating",
      selection: selection1,
      question: question1,
      mainAnswer: mainAnswer1,
      followUps: followUps3,
      followUpCompletion: followUpCompletion1,
    },
  },
  reviewRetryRecommended: {
    setupContext: setupContext1,
    session: {
      status: "review",
      selection: selection1,
      attemptNumber: 1,
      question: question8,
      mainAnswer: mainAnswer1,
      followUps: followUps4,
      followUpCompletion: followUpCompletion1,
      evaluation: evaluation1,
      review: review1,
    },
  },
  reviewNextRecommended: {
    setupContext: setupContext1,
    session: {
      status: "review",
      selection: selection1,
      attemptNumber: 1,
      question: question8,
      mainAnswer: mainAnswer1,
      followUps: followUps4,
      followUpCompletion: followUpCompletion1,
      evaluation: evaluation1,
      review: review2,
    },
  },
  reviewBalanced: {
    setupContext: setupContext1,
    session: {
      status: "review",
      selection: selection1,
      attemptNumber: 1,
      question: question8,
      mainAnswer: mainAnswer1,
      followUps: followUps4,
      followUpCompletion: followUpCompletion1,
      evaluation: evaluation1,
      review: review2,
    },
  },
  reviewHighScore: {
    setupContext: setupContext1,
    session: {
      status: "review",
      selection: selection1,
      attemptNumber: 1,
      question: question8,
      mainAnswer: mainAnswer1,
      followUps: followUps4,
      followUpCompletion: followUpCompletion1,
      evaluation: evaluation2,
      review: review3,
    },
  },
  reviewLowScore: {
    setupContext: setupContext1,
    session: {
      status: "review",
      selection: selection1,
      attemptNumber: 1,
      question: question8,
      mainAnswer: mainAnswer1,
      followUps: followUps4,
      followUpCompletion: followUpCompletion1,
      evaluation: evaluation3,
      review: review4,
    },
  },
  reviewLongContent: {
    setupContext: setupContext1,
    session: {
      status: "review",
      selection: selection1,
      attemptNumber: 1,
      question: question8,
      mainAnswer: mainAnswer1,
      followUps: followUps4,
      followUpCompletion: followUpCompletion1,
      evaluation: evaluation1,
      review: review5,
    },
  },
  reviewNoNewWeaknesses: {
    setupContext: setupContext1,
    session: {
      status: "review",
      selection: selection1,
      attemptNumber: 1,
      question: question8,
      mainAnswer: mainAnswer1,
      followUps: followUps4,
      followUpCompletion: followUpCompletion1,
      evaluation: evaluation1,
      review: review6,
    },
  },
  reviewMotivation: {
    setupContext: setupContext1,
    session: {
      status: "review",
      selection: selection6,
      attemptNumber: 1,
      question: question9,
      mainAnswer: mainAnswer3,
      followUps: followUps1,
      followUpCompletion: followUpCompletion1,
      evaluation: evaluation4,
      review: review7,
    },
  },
  reviewFollowUpEndedEarly: {
    setupContext: setupContext1,
    session: {
      status: "review",
      selection: selection1,
      attemptNumber: 1,
      question: question8,
      mainAnswer: mainAnswer1,
      followUps: followUps5,
      followUpCompletion: followUpCompletion3,
      evaluation: evaluation5,
      review: review8,
    },
  },
  completedSession: {
    setupContext: setupContext1,
    session: {
      status: "completed",
      selection: selection1,
      questionsCompleted: 1,
      retryCount: 0,
      savedQuestionCount: 0,
      weakQuestionCount: 0,
      finalAttemptAverageScore: 85,
      nextStepSuggestion: "继续围绕项目深挖补充量化证据，再进入下一轮练习。",
    },
  },
  retryingCurrentQuestion: {
    setupContext: setupContext1,
    session: {
      status: "answering",
      selection: selection1,
      question: question1,
      assistedRetry: true,
    },
  },
  generatingNextQuestion: {
    setupContext: setupContext1,
    session: { status: "generatingQuestion", selection: selection1 },
  },
  completedWithRetries: {
    setupContext: setupContext1,
    session: {
      status: "completed",
      selection: selection1,
      questionsCompleted: 1,
      retryCount: 1,
      savedQuestionCount: 0,
      weakQuestionCount: 0,
      finalAttemptAverageScore: 94,
      nextStepSuggestion: "继续围绕项目深挖补充量化证据，再进入下一轮练习。",
    },
  },
  completedWithWeakQuestions: {
    setupContext: setupContext1,
    session: {
      status: "completed",
      selection: selection1,
      questionsCompleted: 1,
      retryCount: 0,
      savedQuestionCount: 0,
      weakQuestionCount: 1,
      finalAttemptAverageScore: 85,
      nextStepSuggestion: "优先复习本轮标记的薄弱题。",
    },
  },
} satisfies Record<string, PracticeData>

export type PracticeScenario = keyof typeof scenarios

export function createPracticeScenario(scenario: PracticeScenario = "setupReady"): PracticeData {
  return structuredClone(scenarios[scenario])
}
