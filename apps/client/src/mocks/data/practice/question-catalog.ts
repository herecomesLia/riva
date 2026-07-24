import type { PracticeQuestionType } from "@/models/practice"

import type { GeneratedQuestionGuidanceTemplate, GeneratedQuestionTemplate } from "./types"

export const generatedQuestionTemplates = {
  projectDeepDive: [
    {
      id: "projectDeepDive.performanceOptimization",
      prompt: "请介绍一次你主导前端性能优化的经历，并说明你如何定位问题、推动落地和验证结果。",
      assessedCapabilities: ["问题分析", "技术决策", "跨团队协作", "结果量化"],
      recommendedMaterials: ["全球电商结算页性能优化项目", "性能监控平台建设经历"],
    },
    {
      id: "projectDeepDive.complexProjectTradeoff",
      prompt: "请选择一个你深度参与的复杂项目，说明你做出的关键技术取舍、遇到的阻力以及最终结果。",
      assessedCapabilities: ["问题分析", "技术决策", "跨团队协作", "结果量化"],
      recommendedMaterials: ["性能监控平台建设经历", "跨团队项目协作经历"],
    },
  ],
  behavioral: [
    {
      id: "behavioral.stakeholderConflict",
      prompt: "请介绍一次你与关键协作方存在明显分歧的经历，你如何推动团队形成共识并完成目标？",
      assessedCapabilities: ["协作沟通", "冲突处理", "推动力", "复盘意识"],
      recommendedMaterials: ["跨团队项目协作经历"],
    },
    {
      id: "behavioral.incidentUnderPressure",
      prompt: "请回顾一次高压期限下出现突发问题的经历，你如何确定优先级、协调资源并控制影响？",
      assessedCapabilities: ["协作沟通", "冲突处理", "推动力", "复盘意识"],
      recommendedMaterials: ["线上突发事件处理经历"],
    },
  ],
  businessUnderstanding: [
    {
      id: "businessUnderstanding.priorityAdjustment",
      prompt: "请介绍一次你基于业务目标调整产品或技术优先级的经历，并说明你的判断依据和结果。",
      assessedCapabilities: ["业务判断", "优先级管理", "数据分析", "利益相关方沟通"],
      recommendedMaterials: ["核心指标改进项目", "产品或技术优先级调整经历"],
    },
    {
      id: "businessUnderstanding.experienceVsRevenueTradeoff",
      prompt: "面对用户体验与短期业务收益之间的冲突时，你会如何分析取舍并推动决策？",
      assessedCapabilities: ["业务判断", "优先级管理", "数据分析", "利益相关方沟通"],
      recommendedMaterials: ["核心指标改进项目", "产品或技术优先级调整经历"],
    },
  ],
  motivation: [
    {
      id: "motivation.roleMotivation",
      prompt: "为什么你希望应聘当前目标岗位？请结合过往经历说明你的匹配点和下一阶段目标。",
      assessedCapabilities: ["求职动机", "岗位认知", "自我认知", "职业规划"],
      recommendedMaterials: ["与目标岗位相关的成长经历"],
    },
    {
      id: "motivation.careerDirection",
      prompt: "请说明你选择这个职业方向的关键原因，以及当前岗位如何连接你的长期发展计划。",
      assessedCapabilities: ["求职动机", "岗位认知", "自我认知", "职业规划"],
      recommendedMaterials: ["职业选择关键节点", "与目标岗位相关的成长经历"],
    },
  ],
  technicalFoundation: [
    {
      id: "technicalFoundation.reactRepeatedRendering",
      prompt: "请解释 React 页面出现重复渲染的常见原因，并说明你会如何定位和验证优化效果。",
      assessedCapabilities: ["技术原理", "问题定位", "工程设计", "风险意识"],
      recommendedMaterials: ["React 性能排查经历"],
    },
    {
      id: "technicalFoundation.requestLayerDesign",
      prompt:
        "设计一个需要长期演进的前端数据请求层时，你会如何处理类型安全、缓存一致性和错误边界？",
      assessedCapabilities: ["技术原理", "问题定位", "工程设计", "风险意识"],
      recommendedMaterials: ["前端基础设施设计经历"],
    },
  ],
} as const satisfies Record<PracticeQuestionType, readonly GeneratedQuestionTemplate[]>

export type MockPracticeQuestionTemplateId =
  (typeof generatedQuestionTemplates)[PracticeQuestionType][number]["id"]

export const generatedQuestionGuidanceTemplates = {
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
