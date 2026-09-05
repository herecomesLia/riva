import type {
  FollowUpReferenceAnswer,
  PracticeFollowUp,
  PracticeQuestion,
  PracticeReferenceAnswer,
  PracticeSelection,
  PracticeSession,
  QuestionType,
} from "@/models/practice-workflow"

export const practiceSelectionFixture = {
  targetRoleId: null,
  questionType: "projectDeepDive",
  difficulty: "basic",
  source: "personalized",
  prioritizeWeaknesses: false,
} satisfies PracticeSelection

export const practiceSetupFixture = {
  status: "setup",
  selection: practiceSelectionFixture,
} satisfies PracticeSession

export const practiceQuestions = {
  projectDeepDive: {
    id: "practice-question-project-deep-dive",
    prompt: "请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。",
    questionType: "projectDeepDive",
    difficulty: "basic",
    assessedCapabilities: ["问题分析", "技术决策", "结果量化"],
    recommendedMaterials: ["前端性能优化项目"],
    hints: { status: "notRequested", content: null },
    framework: { status: "notRequested", content: null },
    referenceAnswer: {
      status: "notRequested",
      content: null,
      viewedBeforeSubmission: false,
    },
    isSaved: false,
    isWeak: false,
  },
  behavioral: {
    id: "practice-question-behavioral",
    prompt: "请介绍一次你与关键协作方存在明显分歧的经历，你如何推动团队形成共识并完成目标？",
    questionType: "behavioral",
    difficulty: "basic",
    assessedCapabilities: ["协作沟通", "冲突处理", "复盘意识"],
    recommendedMaterials: ["跨团队协作经历"],
    hints: { status: "notRequested", content: null },
    framework: { status: "notRequested", content: null },
    referenceAnswer: {
      status: "notRequested",
      content: null,
      viewedBeforeSubmission: false,
    },
    isSaved: false,
    isWeak: false,
  },
  businessUnderstanding: {
    id: "practice-question-business-understanding",
    prompt: "请介绍一次你基于业务目标调整产品或技术优先级的经历，并说明你的判断依据和结果。",
    questionType: "businessUnderstanding",
    difficulty: "basic",
    assessedCapabilities: ["业务判断", "优先级管理", "数据分析"],
    recommendedMaterials: ["优先级调整经历"],
    hints: { status: "notRequested", content: null },
    framework: { status: "notRequested", content: null },
    referenceAnswer: {
      status: "notRequested",
      content: null,
      viewedBeforeSubmission: false,
    },
    isSaved: false,
    isWeak: false,
  },
  motivation: {
    id: "practice-question-motivation",
    prompt: "为什么你希望应聘当前目标岗位？请结合过往经历说明你的匹配点和下一阶段目标。",
    questionType: "motivation",
    difficulty: "basic",
    assessedCapabilities: ["求职动机", "岗位认知", "职业规划"],
    recommendedMaterials: ["岗位相关成长经历"],
    hints: { status: "notRequested", content: null },
    framework: { status: "notRequested", content: null },
    referenceAnswer: {
      status: "notRequested",
      content: null,
      viewedBeforeSubmission: false,
    },
    isSaved: false,
    isWeak: false,
  },
  technicalFoundation: {
    id: "practice-question-technical-foundation",
    prompt: "请解释 React 页面出现重复渲染的常见原因，并说明你会如何定位和验证优化效果。",
    questionType: "technicalFoundation",
    difficulty: "basic",
    assessedCapabilities: ["技术原理", "问题定位", "风险意识"],
    recommendedMaterials: ["React 性能排查经历"],
    hints: { status: "notRequested", content: null },
    framework: { status: "notRequested", content: null },
    referenceAnswer: {
      status: "notRequested",
      content: null,
      viewedBeforeSubmission: false,
    },
    isSaved: false,
    isWeak: false,
  },
} satisfies Record<QuestionType, PracticeQuestion>

export const practiceQuestionHelp = {
  projectDeepDive: {
    hints: ["说明项目目标和你的职责。", "用指标说明优化效果。"],
    framework: ["背景与目标", "关键决策与行动", "结果与复盘"],
    reference: {
      kind: "personalizedExample",
      answer: "我先用监控定位性能瓶颈，再分阶段落地优化，并用上线前后的核心指标验证结果。",
      keyPoints: ["明确个人决策", "提供量化验证"],
      commonMistakes: ["只罗列技术动作", "把团队成果全部归为个人贡献"],
    },
  },
  behavioral: {
    hints: ["说明双方分歧和共同目标。", "聚焦你采取的具体行动。"],
    framework: ["情境与任务", "沟通与推动", "结果与复盘"],
    reference: {
      kind: "personalizedExample",
      answer: "我先确认共同目标和各方约束，再用小范围验证把争论转为可比较的证据。",
      keyPoints: ["识别分歧根因", "说明个人推动"],
      commonMistakes: ["泛泛地说加强沟通", "把协作方描述成阻碍者"],
    },
  },
  businessUnderstanding: {
    hints: ["先明确业务目标和核心指标。", "说明不同方案的收益与成本。"],
    framework: ["业务目标", "判断依据", "取舍与验证"],
    reference: {
      kind: "personalizedExample",
      answer: "我根据目标指标、用户影响和交付成本重新排序事项，并约定验证窗口和纠偏条件。",
      keyPoints: ["连接业务目标", "解释优先级取舍"],
      commonMistakes: ["只描述执行过程", "没有验证指标"],
    },
  },
  motivation: {
    hints: ["说明岗位吸引你的具体原因。", "连接相关经历和下一阶段目标。"],
    framework: ["岗位理解", "经历匹配", "贡献与发展目标"],
    reference: {
      kind: "personalizedExample",
      answer: "这个岗位与我的核心经验相匹配，也能让我继续承担更复杂的问题并创造可衡量的业务价值。",
      keyPoints: ["体现岗位理解", "连接个人经历"],
      commonMistakes: ["只表达泛泛兴趣", "没有说明可贡献的价值"],
    },
  },
  technicalFoundation: {
    hints: ["先区分 render、commit 和浏览器绘制。", "用工具验证首要假设。"],
    framework: ["原因假设", "定位步骤", "优化与验证"],
    reference: {
      kind: "technicalReference",
      answer: "我会先用 React Profiler 确认更新来源和真实耗时，再针对首要假设做单变量验证。",
      keyPoints: ["基于证据定位", "验证性能与正确性"],
      commonMistakes: ["先加 memo 再找原因", "把开发环境现象当作生产问题"],
    },
  },
} satisfies Record<
  QuestionType,
  {
    hints: string[]
    framework: string[]
    reference: PracticeReferenceAnswer
  }
>

export const practiceFollowUps: Partial<
  Record<
    QuestionType,
    {
      question: PracticeFollowUp
      hints: string[]
      framework: string[]
      reference: FollowUpReferenceAnswer
    }
  >
> = {
  projectDeepDive: {
    question: {
      id: "practice-follow-up-project-deep-dive",
      prompt: "你如何验证结果主要来自你的关键决策，而不是同期的其他变化？",
      hints: { status: "notRequested", content: null },
      framework: { status: "notRequested", content: null },
      referenceAnswer: {
        status: "notRequested",
        content: null,
        viewedBeforeSubmission: false,
      },
    },
    hints: ["说明同期发生的其他变化。", "给出对照或分层证据。"],
    framework: ["归因结论", "对照证据", "结论边界"],
    reference: {
      kind: "personalizedSupplement",
      addressedGap: "结果归因证据不足。",
      answer: "我会列出同期变化，再通过灰度、分层或时间窗口对比来界定关键决策的影响。",
      keyPoints: ["排除干扰因素", "说明证据边界"],
      commonMistakes: ["只重复最终指标", "把相关性当作因果"],
    },
  },
  behavioral: {
    question: {
      id: "practice-follow-up-behavioral",
      prompt: "如果重新处理这次分歧，你会调整哪一个具体行动，为什么？",
      hints: { status: "notRequested", content: null },
      framework: { status: "notRequested", content: null },
      referenceAnswer: {
        status: "notRequested",
        content: null,
        viewedBeforeSubmission: false,
      },
    },
    hints: ["选择一个真实不足。", "说明下次的具体调整。"],
    framework: ["复盘结论", "调整行动", "预期验证"],
    reference: {
      kind: "personalizedSupplement",
      addressedGap: "缺少具体复盘和可执行改进。",
      answer: "如果重来，我会更早确认共同目标，并用阶段性反馈验证沟通是否有效。",
      keyPoints: ["承认具体不足", "形成可验证行动"],
      commonMistakes: ["只说加强沟通", "再次证明自己正确"],
    },
  },
  businessUnderstanding: {
    question: {
      id: "practice-follow-up-business-understanding",
      prompt: "优先级调整后，你会如何用指标验证判断并及时纠偏？",
      hints: { status: "notRequested", content: null },
      framework: { status: "notRequested", content: null },
      referenceAnswer: {
        status: "notRequested",
        content: null,
        viewedBeforeSubmission: false,
      },
    },
    hints: ["区分领先指标和结果指标。", "说明纠偏条件。"],
    framework: ["判断目标", "验证指标", "继续或纠偏"],
    reference: {
      kind: "personalizedSupplement",
      addressedGap: "缺少分阶段验证和纠偏机制。",
      answer: "我会用领先指标判断方向，再用结果指标验证影响，并提前约定缩小范围或回退的条件。",
      keyPoints: ["分阶段验证", "预设纠偏条件"],
      commonMistakes: ["只看单一指标", "没有调整机制"],
    },
  },
  technicalFoundation: {
    question: {
      id: "practice-follow-up-technical-foundation",
      prompt: "你会先验证哪个重复渲染假设，如何证明它是真实瓶颈而不是开发环境现象？",
      hints: { status: "notRequested", content: null },
      framework: { status: "notRequested", content: null },
      referenceAnswer: {
        status: "notRequested",
        content: null,
        viewedBeforeSubmission: false,
      },
    },
    hints: ["说明首个假设的依据。", "在生产构建中复测。"],
    framework: ["首个假设", "验证实验", "结论边界"],
    reference: {
      kind: "technicalReference",
      addressedGap: "缺少对首要假设的可证伪验证。",
      answer:
        "我会用 Profiler 找到更新来源，只改变一个因素复测，并在生产构建中排除 Strict Mode 干扰。",
      keyPoints: ["单变量验证", "排除开发环境干扰"],
      commonMistakes: ["先优化再定位", "只看函数执行次数"],
    },
  },
}
