import type {
  InterviewConfiguration,
  InterviewFollowUpQuestionResponse,
  InterviewFollowUpReviewResponse,
  InterviewProgressResponse,
  InterviewQuestionResponse,
  InterviewQuestionReviewResponse,
  InterviewReferenceAnswerContentResponse,
  InterviewRound,
} from "@/models/interview"

export type InterviewAgentMockScenario =
  | "noFollowUps"
  | "singleFollowUp"
  | "multipleFollowUps"
  | "lastQuestionFollowUp"
  | "unknownTotal"
  | "adjustedPlan"

export type MockInterviewAgentPlan = {
  scenario: InterviewAgentMockScenario
  initialProgress: Pick<InterviewProgressResponse, "totalMainQuestions" | "planRevision">
  planChanges: Array<{
    afterCompletedMainQuestions: number
    totalMainQuestions: number | null
    planRevision: number
  }>
  questions: Array<{
    question: InterviewQuestionResponse
    followUps: InterviewFollowUpQuestionResponse[]
  }>
}

type QuestionReviewTemplate = Omit<InterviewQuestionReviewResponse, "questionId"> & {
  weaknesses: string[]
  risks: string[]
  communicationSuggestions: string[]
  preparationSuggestions: string[]
}

type FollowUpCatalogEntry = {
  key: string
  basicPrompt: string
  pressurePrompt: string
  review: Omit<InterviewFollowUpReviewResponse, "followUpQuestionId">
  referenceAnswer: InterviewReferenceAnswerContentResponse
}

type QuestionCatalogEntry = {
  key: string
  type: InterviewQuestionResponse["type"]
  assessedCapabilities: string[]
  basicPrompt: string
  pressurePrompt: string
  mockAnswer: string
  review: QuestionReviewTemplate
  referenceAnswer: InterviewReferenceAnswerContentResponse
  followUps: [FollowUpCatalogEntry, FollowUpCatalogEntry]
}

type RoleQuestionCatalog = {
  supportedRounds: [InterviewRound, ...InterviewRound[]]
  hr: [QuestionCatalogEntry, QuestionCatalogEntry, QuestionCatalogEntry]
  business: [QuestionCatalogEntry, QuestionCatalogEntry, QuestionCatalogEntry]
  technical?: [QuestionCatalogEntry, QuestionCatalogEntry, QuestionCatalogEntry]
}

const generatedAt = "2026-07-24T02:20:00.000Z"

function referenceAnswer(
  recommendedStructure: string[],
  keyPoints: string[],
  exampleAnswer: string,
): InterviewReferenceAnswerContentResponse {
  return {
    recommendedStructure,
    keyPoints,
    exampleAnswer,
    usageGuidance: "请结合自己的真实经历替换示例内容，保留回答结构和证据链即可。",
    generatedAt,
  }
}

function review(
  score: number,
  summary: string,
  strengths: string[],
  issues: string[],
): QuestionReviewTemplate {
  return {
    score,
    summary,
    strengths,
    issues,
    weaknesses: [...issues],
    risks: [`若继续追问，${issues[0] ?? "回答证据仍需补充"}`],
    communicationSuggestions: ["按背景、判断、行动和结果组织回答"],
    preparationSuggestions: [`补充能够证明“${issues[0] ?? "岗位匹配"}”的真实案例`],
  }
}

function followUp(
  key: string,
  basicPrompt: string,
  pressurePrompt: string,
  summary: string,
  exampleAnswer: string,
): FollowUpCatalogEntry {
  return {
    key,
    basicPrompt,
    pressurePrompt,
    review: {
      score: 80,
      summary,
      strengths: ["能够直接回应追问重点"],
      issues: ["证据和边界还可以更具体"],
    },
    referenceAnswer: referenceAnswer(
      ["先回应追问前提", "说明判断依据", "给出具体行动", "明确结果或边界"],
      ["不回避约束", "使用真实证据", "说明个人判断"],
      exampleAnswer,
    ),
  }
}

function question(
  value: Omit<QuestionCatalogEntry, "review" | "referenceAnswer" | "followUps"> & {
    review: Parameters<typeof review>
    referenceAnswer: Parameters<typeof referenceAnswer>
    followUps: [Parameters<typeof followUp>, Parameters<typeof followUp>]
  },
): QuestionCatalogEntry {
  return {
    ...value,
    review: review(...value.review),
    referenceAnswer: referenceAnswer(...value.referenceAnswer),
    followUps: value.followUps.map((entry) => followUp(...entry)) as [
      FollowUpCatalogEntry,
      FollowUpCatalogEntry,
    ],
  }
}

const frontendCatalog: RoleQuestionCatalog = {
  supportedRounds: ["hr", "firstBusiness", "technical", "manager", "final", "comprehensive"],
  hr: [
    question({
      key: "motivation",
      type: "motivation",
      assessedCapabilities: ["求职动机", "岗位理解", "稳定性"],
      basicPrompt: "为什么选择高级前端工程师岗位？请结合你的经历说明主要动机。",
      pressurePrompt:
        "你为什么现在选择高级前端工程师岗位？如果工作内容与预期有差距，什么条件会让你仍愿意长期投入？",
      mockAnswer: "我希望把既有的前端架构和性能治理经验用于更复杂的业务，并持续扩大技术影响力。",
      review: [
        82,
        "动机与前端经历关联清楚，长期投入条件仍可量化。",
        ["岗位理解准确"],
        ["稳定性判断标准不够具体"],
      ],
      referenceAnswer: [
        ["说明转岗时点", "连接前端经历", "解释岗位吸引点", "给出长期判断标准"],
        ["避免只谈公司光环", "体现对岗位职责的理解", "说明稳定投入条件"],
        "我选择这个岗位，是因为复杂前端链路与我过去的架构和性能治理经验匹配。我希望先承担核心链路交付，再逐步形成稳定性治理方法。只要职责、反馈和成长路径清晰，我会持续投入并用阶段结果校准发展。",
      ],
      followUps: [
        [
          "commitment",
          "你希望两年后在前端能力上达到什么目标？",
          "如果一年后仍主要承担交付工作、没有架构职责，你会如何判断是否继续？",
          "能够说明成长目标，阶段判断标准还可更明确。",
          "我会先与负责人校准预期，并观察是否仍能通过关键项目积累架构能力；若长期没有职责升级和有效反馈，再重新评估。",
        ],
        [
          "tradeoff",
          "选择岗位时你最看重哪两个因素？",
          "如果薪酬、技术成长和业务影响力不能同时满足，你会如何排序并承担选择后果？",
          "能够表达取舍，仍需说明排序依据。",
          "我会优先保证工作内容能积累关键能力，其次看业务影响力，并在可接受区间内权衡薪酬。",
        ],
      ],
    }),
    question({
      key: "resume-risk",
      type: "resumeRisk",
      assessedCapabilities: ["简历一致性", "风险沟通", "自我认知"],
      basicPrompt: "请解释你最近一次工作变化的原因，以及它与你当前求职方向的关系。",
      pressurePrompt:
        "你的经历中存在一次较短任职。为什么我们不应把它视为稳定性风险？请给出可验证的解释。",
      mockAnswer: "这次变化源于职责调整，我完成了交接，并据此确认下一份工作更关注核心前端架构。",
      review: [
        79,
        "能够正面解释经历变化，外部可验证信息仍可补充。",
        ["风险回应直接"],
        ["事实证据不足"],
      ],
      referenceAnswer: [
        ["陈述客观事实", "说明个人选择", "交代完整交接", "连接当前方向"],
        ["不回避风险", "避免评价前雇主", "提供时间线和结果"],
        "当时团队职责调整，我的工作重心与长期前端方向出现偏差。我完成了版本交付和文档交接后离开，也因此更明确下一份工作要聚焦复杂前端链路和长期技术建设。",
      ],
      followUps: [
        [
          "evidence",
          "这段经历中最能证明你专业性的结果是什么？",
          "如果前主管对这段经历有不同评价，你认为分歧最可能在哪里？",
          "能够提供结果，仍需明确评价边界。",
          "我会用已交付版本、交接记录和复盘结论说明事实，同时承认双方可能对职责预期存在不同理解。",
        ],
        [
          "repeat-risk",
          "你会如何避免类似情况再次发生？",
          "如果入职后再次发现职责偏差，你前三个月会采取哪些动作，而不是直接离开？",
          "风险预防动作清楚，沟通节奏可更具体。",
          "我会在入职初期确认目标和成功标准，按月复盘职责偏差，并先通过沟通和项目选择推动调整。",
        ],
      ],
    }),
    question({
      key: "career-plan",
      type: "motivation",
      assessedCapabilities: ["职业规划", "自我认知", "岗位匹配"],
      basicPrompt: "未来三年你希望在前端专业能力上形成什么优势？",
      pressurePrompt:
        "你说希望成为前端技术负责人，但目前哪项能力最不足？为什么团队仍应给你这个成长机会？",
      mockAnswer: "我希望形成复杂链路治理和跨团队技术规划能力，同时补强业务判断与团队影响力。",
      review: [
        81,
        "方向清晰，能力差距和阶段里程碑还可具体。",
        ["职业方向明确"],
        ["成长路径拆解不足"],
      ],
      referenceAnswer: [
        ["明确目标角色", "列出现有基础", "承认关键差距", "给出阶段行动"],
        ["目标与岗位相关", "差距真实", "里程碑可观察"],
        "未来三年我希望能独立负责一条核心前端链路。我已有性能治理和跨团队交付经验，短板是长期技术规划，因此会先承担季度级治理项目，再逐步负责路线图和团队机制。",
      ],
      followUps: [
        [
          "milestone",
          "你会用什么结果判断第一年目标已经达成？",
          "如果第一年没有获得预期项目机会，你准备如何主动创造证据？",
          "里程碑方向正确，主动性证据仍可加强。",
          "我会以独立负责关键项目、形成可复用机制和获得跨团队反馈为判断，并主动承担现有链路中的治理问题。",
        ],
        [
          "alternative",
          "如果管理路径不适合你，还有什么发展选择？",
          "如果专业与管理路径都没有明确晋升，你会如何保持投入而不是只等待机会？",
          "备选路径合理，持续投入方式仍可具体。",
          "我会优先积累可迁移的专业影响力，通过项目结果、机制建设和带教证明价值，而不是只依赖职位变化。",
        ],
      ],
    }),
  ],
  business: [
    question({
      key: "business-understanding",
      type: "technicalOrBusiness",
      assessedCapabilities: ["业务理解", "技术价值", "指标意识"],
      basicPrompt: "你如何理解商家运营产品中前端团队的核心价值？",
      pressurePrompt: "如果业务认为前端性能治理短期不能带来收入，你会如何证明它值得占用研发资源？",
      mockAnswer: "前端需要保障复杂工作流效率和稳定性，并用用户行为与业务指标证明技术投入价值。",
      review: [
        83,
        "能够连接技术与业务指标，优先级方法还可细化。",
        ["技术价值表达清楚"],
        ["投入优先级依据不足"],
      ],
      referenceAnswer: [
        ["定义用户任务", "识别业务瓶颈", "连接前端指标", "说明优先级方法"],
        ["从用户效率出发", "同时观察质量与业务指标", "明确机会成本"],
        "商家运营前端的价值不仅是交付页面，还要降低复杂任务的操作成本并保障关键链路稳定。我会把性能、错误率和任务完成时长与转化、处理效率等指标关联，再按影响范围和投入成本排序。",
      ],
      followUps: [
        [
          "metric",
          "你会优先观察哪三个指标？",
          "如果性能改善但转化没有变化，你如何解释并决定是否继续投入？",
          "指标选择合理，停止条件仍需明确。",
          "我会同时看任务完成时长、错误率和关键转化；若业务指标无变化，会检查样本、链路位置和用户分层，再决定调整或停止。",
        ],
        [
          "conflict",
          "技术质量与业务交付冲突时你如何沟通？",
          "如果业务负责人拒绝延期且风险最终由你承担，你会如何留下决策证据并控制损失？",
          "风险沟通完整，决策留痕仍可更具体。",
          "我会量化风险、给出分阶段方案和回滚条件，并在评审记录中明确共同决策与监控责任。",
        ],
      ],
    }),
    question({
      key: "collaboration",
      type: "behavioral",
      assessedCapabilities: ["跨团队协作", "冲突处理", "结果推进"],
      basicPrompt: "请介绍一次你推动跨团队前端项目达成结果的经历。",
      pressurePrompt:
        "请介绍一次关键合作方持续反对你的前端方案，但你仍必须按期交付的经历。你承担了什么结果？",
      mockAnswer: "我把分歧拆成接口、风险和时间约束，推动各方采用分阶段灰度并按期交付。",
      review: [
        80,
        "协作动作完整，个人承担的最终结果还可量化。",
        ["冲突处理有结构"],
        ["结果证据不足"],
      ],
      referenceAnswer: [
        ["说明核心分歧", "界定个人职责", "描述推进动作", "量化最终结果"],
        ["不把协作等同开会", "呈现关键判断", "说明失败预案"],
        "我负责结算链路前端改造时，各方对上线风险存在分歧。我把争议拆成接口稳定性、回滚能力和交付时间，组织数据评审并提出分阶段灰度，最终按期上线且没有重大故障。",
      ],
      followUps: [
        [
          "ownership",
          "其中哪项关键决定是你做出的？",
          "如果灰度方案失败，哪部分责任由你承担，你预先做了什么准备？",
          "个人贡献清晰，失败预案可更具体。",
          "我决定先缩小上线范围，并负责前端监控、降级开关和回滚验证，失败时能够在约定时间内恢复。",
        ],
        [
          "opposition",
          "你如何让反对方接受方案？",
          "如果对方仍不接受且级别高于你，你如何升级问题又不破坏合作关系？",
          "影响策略合理，升级机制仍可展开。",
          "我会先用共同目标和数据缩小分歧，无法解决时带着备选方案和影响评估升级，而不是只上报冲突。",
        ],
      ],
    }),
    question({
      key: "delivery-plan",
      type: "roleCapability",
      assessedCapabilities: ["规划能力", "结果管理", "风险控制"],
      basicPrompt: "如果入职后负责核心前端链路，你会如何规划前三个月？",
      pressurePrompt:
        "入职后你发现核心前端链路事故频发、没有监控且业务仍要求加速交付。前三个月你如何取舍并对结果负责？",
      mockAnswer: "我会先建立风险基线和监控，再分阶段治理最高风险问题并定义验收指标。",
      review: [
        84,
        "规划阶段明确，资源冲突下的取舍依据还可加强。",
        ["风险意识较强"],
        ["资源取舍依据不足"],
      ],
      referenceAnswer: [
        ["诊断现状", "建立风险排序", "拆分阶段目标", "定义验收机制"],
        ["不承诺一次解决全部问题", "兼顾交付", "指标和责任明确"],
        "第一个月梳理链路并补齐核心监控，第二个月治理最高风险问题并建立回滚演练，第三个月推动变更和复盘机制落地，同时为业务交付保留明确容量。",
      ],
      followUps: [
        [
          "priority",
          "你会如何确定第一个治理目标？",
          "如果最高风险问题三个月无法解决，你如何证明阶段投入仍然有效？",
          "优先级方法合理，阶段价值证明仍可加强。",
          "我会按影响、频率和可控性排序；长期问题先通过监控、降级和演练降低暴露面，并用事故指标证明阶段价值。",
        ],
        [
          "resource",
          "资源不足时你会先放弃什么？",
          "如果只能在新功能和稳定性中二选一，你如何让业务共同承担决策后果？",
          "取舍明确，共同决策机制仍可具体。",
          "我会呈现两种选择的量化影响，明确最低安全底线，并让产品和技术负责人共同确认优先级与风险。",
        ],
      ],
    }),
  ],
  technical: [
    question({
      key: "frontend-architecture",
      type: "technicalOrBusiness",
      assessedCapabilities: ["前端架构", "技术决策", "演进能力"],
      basicPrompt: "请说明你会如何设计一个大型商家运营前端应用的模块边界。",
      pressurePrompt:
        "一个大型商家运营前端已经出现依赖混乱、发布互相阻塞和运行时性能下降，你如何在不中断业务的情况下重构架构？",
      mockAnswer: "我会先识别业务边界和依赖方向，通过度量建立基线，再按风险逐步拆分和迁移。",
      review: [
        85,
        "架构思路完整，迁移成本和失败边界还可量化。",
        ["模块边界清楚"],
        ["演进风险说明不足"],
      ],
      referenceAnswer: [
        ["识别业务边界", "建立依赖规则", "设计渐进迁移", "定义验证指标"],
        ["避免一次性重写", "说明数据与状态边界", "包含回滚方案"],
        "我会先用依赖图和发布数据定位耦合点，以业务能力划分模块并约束依赖方向。迁移从低风险链路开始，保留兼容层和回滚开关，用构建、发布和运行时指标验证收益。",
      ],
      followUps: [
        [
          "boundary",
          "你如何判断一个模块边界是否合理？",
          "如果业务边界频繁变化，你如何避免模块设计再次退化？",
          "边界判断有依据，持续治理机制还可加强。",
          "我会观察变更是否集中、依赖是否单向以及团队是否能独立交付，并通过架构检查和责任归属持续治理。",
        ],
        [
          "migration",
          "你会从哪个模块开始迁移？",
          "如果迁移半年后只完成一半且收益不明显，你如何决定继续、调整还是停止？",
          "迁移顺序合理，停止条件仍需明确。",
          "我会选择依赖清晰且痛点可度量的模块，用阶段指标判断收益；若指标无改善，会复盘假设并停止无效扩张。",
        ],
      ],
    }),
    question({
      key: "frontend-project-deep-dive",
      type: "projectDeepDive",
      assessedCapabilities: ["问题分析", "前端专业能力", "结果量化"],
      basicPrompt: "请介绍一次你主导的前端性能优化，包括定位、方案和结果。",
      pressurePrompt:
        "请介绍一次你主导的前端性能优化。如果同期还有营销和服务端改动，你如何证明业务收益来自你的方案？",
      mockAnswer: "我通过真实用户监控定位长任务和资源瀑布，再用灰度对照验证性能与业务指标。",
      review: [82, "技术过程清楚，业务收益归因仍可加强。", ["定位过程完整"], ["业务归因证据不足"]],
      referenceAnswer: [
        ["交代业务背景", "说明定位过程", "解释方案取舍", "给出验证与归因"],
        ["区分现象和根因", "包含灰度或对照", "说明个人贡献"],
        "我先用真实用户监控按设备和网络分组，确认瓶颈来自长任务与资源瀑布，再实施拆包和渲染调度。灰度期间保持其他策略一致，同时观察性能和下单漏斗，验证方案收益。",
      ],
      followUps: [
        [
          "evidence",
          "你如何验证性能改善确实影响了用户体验？",
          "如果监控只证明性能改善、不能证明业务收益，你会如何补充因果证据？",
          "验证思路完整，成功标准还可提前定义。",
          "我会结合体验指标、任务完成率和用户分组建立灰度对照，在预设样本量和观察周期后判断收益。",
        ],
        [
          "attribution",
          "你如何排除其他同期改动的影响？",
          "如果无法完全隔离营销和服务端变量，你如何表达结论而不夸大个人贡献？",
          "归因变量识别完整，结论边界需更审慎。",
          "我会记录同期变更并分层分析；无法隔离时明确结论只能说明相关性，不把全部收益归因于前端。",
        ],
      ],
    }),
    question({
      key: "frontend-stability",
      type: "roleCapability",
      assessedCapabilities: ["稳定性治理", "故障处理", "风险控制"],
      basicPrompt: "你会如何建立前端核心链路的稳定性治理体系？",
      pressurePrompt:
        "线上故障由你的前端变更触发，但监控和回滚都失效。你如何止损、解释责任并防止复发？",
      mockAnswer: "我会先止损和同步影响，再恢复监控、回滚与变更治理，并用复盘推动机制修复。",
      review: [
        83,
        "治理框架完整，事故责任和组织改进还可具体。",
        ["风险控制全面"],
        ["责任闭环不够具体"],
      ],
      referenceAnswer: [
        ["立即止损", "同步影响", "定位恢复", "无责复盘并修复机制"],
        ["先恢复业务", "不回避个人责任", "同时修复技术与流程"],
        "我会先停止扩散、启用降级并同步影响范围，随后恢复可观测性定位问题。业务恢复后明确个人决策责任，补齐回滚验证、发布门禁和演练机制。",
      ],
      followUps: [
        [
          "incident",
          "事故处理中你最先确认什么？",
          "如果无法快速定位且管理层要求给出恢复时间，你如何沟通不确定性？",
          "止损优先级正确，不确定性沟通可更清晰。",
          "我会先确认影响与可用降级手段，用已知事实、当前假设和下一检查点沟通，而不是给出虚假时间。",
        ],
        [
          "accountability",
          "复盘中如何区分个人失误和系统问题？",
          "如果团队认为主要责任在你，你如何接受责任同时推动系统性改进？",
          "责任态度成熟，改进落地方式仍可具体。",
          "我会承认自己的判断和操作责任，同时用事实说明哪些机制缺口放大了影响，并负责推动明确的修复项落地。",
        ],
      ],
    }),
  ],
}

const productCatalog: RoleQuestionCatalog = {
  supportedRounds: ["hr", "firstBusiness", "manager", "final", "comprehensive"],
  hr: [
    question({
      key: "motivation",
      type: "motivation",
      assessedCapabilities: ["求职动机", "产品认知", "稳定性"],
      basicPrompt: "为什么选择产品经理岗位？请结合你的经历说明。",
      pressurePrompt:
        "你为什么现在转向产品经理岗位？如果入职后长期做执行而非策略，你为什么不会再次离开？",
      mockAnswer: "我希望把用户研究、业务分析和跨团队交付经验沉淀为完整的产品判断能力。",
      review: [82, "产品动机真实，长期投入条件还可具体。", ["产品方向清晰"], ["稳定性依据不足"]],
      referenceAnswer: [
        ["说明选择时点", "连接相关经历", "解释产品吸引点", "给出投入标准"],
        ["避免泛泛谈热爱", "体现产品职责理解", "说明长期判断"],
        "我过去负责需求分析和跨团队交付，最有投入感的是识别用户问题并推动方案落地。产品经理岗位能让我系统承担从洞察到结果的责任，我会用业务影响和能力积累判断长期投入。",
      ],
      followUps: [
        [
          "commitment",
          "你未来两年的产品能力目标是什么？",
          "如果两年后仍没有独立产品线，你如何判断这段投入是否值得？",
          "目标清楚，阶段价值判断仍可细化。",
          "我会先以独立负责关键模块和形成可复用分析方法为目标，不只用职位或产品线大小判断成长。",
        ],
        [
          "tradeoff",
          "你选择产品岗位最看重什么？",
          "如果用户价值与短期商业指标冲突，你如何排序并承担结果？",
          "价值排序明确，结果责任仍需展开。",
          "我会先确认公司阶段目标和用户损害边界，选择可逆方案验证，并对指标与长期信任的影响共同负责。",
        ],
      ],
    }),
    question({
      key: "resume-risk",
      type: "resumeRisk",
      assessedCapabilities: ["简历一致性", "风险沟通", "自我认知"],
      basicPrompt: "请解释你经历中一次方向变化，以及它如何帮助你确认产品岗位。",
      pressurePrompt: "你的经历看起来缺少连续的产品所有权。为什么我们不应把这视为岗位匹配风险？",
      mockAnswer: "不同经历让我逐步承担用户研究、方案设计和结果复盘，也确认了长期产品方向。",
      review: [
        79,
        "能够解释经历主线，连续所有权证据仍需加强。",
        ["经历关联合理"],
        ["端到端证据不足"],
      ],
      referenceAnswer: [
        ["梳理经历主线", "指出产品职责", "提供结果证据", "承认并补足差距"],
        ["不包装职位名称", "强调实际职责", "说明持续投入"],
        "虽然职位名称不同，但我持续承担用户问题分析、方案取舍和跨团队落地，并对关键指标复盘。这些经历让我确认产品方向，也让我看到需要补强长期路线图能力。",
      ],
      followUps: [
        [
          "ownership",
          "哪项产品结果可以证明你的所有权？",
          "如果项目成功主要来自研发和运营，你的不可替代贡献是什么？",
          "能够说明个人贡献，归因边界仍可更严谨。",
          "我负责定义问题、明确成功指标和推动关键取舍，同时会如实区分团队共同结果和个人决策贡献。",
        ],
        [
          "gap",
          "你最需要补足的产品能力是什么？",
          "为什么团队要承担培养你的成本，而不是选择更成熟的候选人？",
          "差距识别真实，快速产出路径仍可具体。",
          "我的短板是长期路线图，但可以立即贡献用户分析和复杂协作，并通过明确里程碑快速补齐规划能力。",
        ],
      ],
    }),
    question({
      key: "career-plan",
      type: "motivation",
      assessedCapabilities: ["职业规划", "产品成长", "岗位匹配"],
      basicPrompt: "未来三年你希望成为怎样的产品经理？",
      pressurePrompt: "你希望成为业务负责人，但当前商业判断最薄弱。为什么这个目标不是空泛愿望？",
      mockAnswer: "我希望先独立负责关键模块，再形成用户洞察、商业判断和路线图规划的完整能力。",
      review: [
        81,
        "成长方向明确，商业能力里程碑还可量化。",
        ["发展路径合理"],
        ["阶段标准不够具体"],
      ],
      referenceAnswer: [
        ["定义目标角色", "列出现有基础", "承认能力差距", "给出阶段里程碑"],
        ["目标与业务相关", "阶段结果可观察", "包含反馈机制"],
        "第一年我希望独立负责关键模块并建立指标体系，第二年负责跨模块路线图，第三年能够结合用户价值和商业目标做资源取舍。",
      ],
      followUps: [
        [
          "milestone",
          "第一年你会用什么结果衡量成长？",
          "如果指标增长但用户反馈恶化，你如何判断自己是否真的成长？",
          "成长指标较完整，质量指标仍可加强。",
          "我会同时看业务指标、用户任务成功率和跨团队反馈，不把单一增长等同产品能力提升。",
        ],
        [
          "feedback",
          "你如何获得高质量产品反馈？",
          "如果上级只看结果、不提供方法反馈，你如何主动校准判断？",
          "反馈渠道合理，主动校准方法仍可具体。",
          "我会用方案评审、用户研究复盘和决策日志邀请针对性反馈，并比较预测与实际结果校准判断。",
        ],
      ],
    }),
  ],
  business: [
    question({
      key: "product-case",
      type: "technicalOrBusiness",
      assessedCapabilities: ["业务分析", "用户洞察", "方案取舍"],
      basicPrompt: "如果商家反馈运营后台效率低，你会如何分析并确定产品改进方向？",
      pressurePrompt:
        "商家抱怨后台效率低，但数据没有明显异常、研发资源也只够做一个改动。你如何证明问题并做取舍？",
      mockAnswer: "我会按关键任务拆解行为数据与访谈证据，定位高频高损耗步骤，再用可逆方案验证。",
      review: [
        85,
        "分析框架完整，资源约束下的验证成本还可量化。",
        ["用户问题拆解清楚"],
        ["取舍成本说明不足"],
      ],
      referenceAnswer: [
        ["定义目标用户和任务", "结合定量与定性证据", "识别关键瓶颈", "设计最小验证"],
        ["不直接接受解决方案", "说明资源取舍", "定义成功与停止条件"],
        "我会先按商家类型和核心任务分层，结合行为漏斗、任务时长和访谈定位瓶颈。资源有限时优先选择影响高、可逆且能验证关键假设的改动，并提前定义成功和停止指标。",
      ],
      followUps: [
        [
          "evidence",
          "定量数据与访谈结论冲突时你相信哪个？",
          "如果大客户强烈投诉但只占少量用户，你如何防止声音大小替代真实优先级？",
          "证据权衡合理，客户价值分层仍可加强。",
          "我会检查样本和场景差异，并把客户价值、影响严重度和用户规模分别呈现，不让单一声音直接决定优先级。",
        ],
        [
          "decision",
          "你会如何选择唯一的改动？",
          "如果你的选择失败并浪费一个季度窗口，你如何解释决策质量？",
          "取舍逻辑清楚，失败复盘框架仍可具体。",
          "我会记录假设、证据和机会成本；失败后区分是信息不足、执行偏差还是假设错误，并及时停止和沉淀判断。",
        ],
      ],
    }),
    question({
      key: "product-collaboration",
      type: "behavioral",
      assessedCapabilities: ["跨团队协作", "优先级沟通", "结果推进"],
      basicPrompt: "请介绍一次你推动研发、设计和运营共同完成产品目标的经历。",
      pressurePrompt:
        "研发认为需求价值不足、运营要求立即上线、设计拒绝降级。你如何做最终取舍并承担结果？",
      mockAnswer: "我会统一目标和约束，用证据拆解分歧，提出分阶段方案并明确共同成功指标。",
      review: [
        81,
        "协作过程完整，最终产品取舍和责任仍可突出。",
        ["共识建立有效"],
        ["决策责任不够明确"],
      ],
      referenceAnswer: [
        ["说明目标冲突", "呈现证据与约束", "做出明确取舍", "复盘最终结果"],
        ["不是简单折中", "明确产品责任", "包含失败预案"],
        "我先让各方对用户问题和时间窗口形成共同事实，再明确不可牺牲的体验底线，选择分阶段上线并承担范围取舍，最终用共同指标复盘结果。",
      ],
      followUps: [
        [
          "conflict",
          "哪一方最终做了让步，为什么？",
          "如果没有任何一方愿意让步，你凭什么做最终决定？",
          "冲突处理清楚，决策授权仍可说明。",
          "我会基于产品目标、证据和既定决策机制做取舍，必要时升级负责人确认，而不是用个人偏好强推。",
        ],
        [
          "failure",
          "结果没有达到预期时你如何复盘？",
          "如果团队认为失败来自你的优先级判断，你会如何回应？",
          "复盘态度成熟，纠偏行动仍可具体。",
          "我会公开原始假设和决策依据，承担判断责任，区分执行与假设问题并推动明确纠偏。",
        ],
      ],
    }),
    question({
      key: "product-roadmap",
      type: "roleCapability",
      assessedCapabilities: ["产品规划", "商业判断", "结果管理"],
      basicPrompt: "你会如何制定一个季度的商家产品路线图？",
      pressurePrompt:
        "收入目标、客户承诺和长期产品建设同时争夺资源，你如何制定季度路线图并拒绝其中一部分需求？",
      mockAnswer:
        "我会从公司目标和用户问题建立机会池，用影响、证据、成本和风险排序并保留验证容量。",
      review: [
        84,
        "规划框架完整，拒绝需求时的利益相关方管理还可加强。",
        ["路线图逻辑清楚"],
        ["拒绝策略不够具体"],
      ],
      referenceAnswer: [
        ["对齐公司目标", "建立问题机会池", "按证据和成本排序", "定义里程碑与调整机制"],
        ["路线图不是需求清单", "保留发现与验证容量", "说明拒绝依据"],
        "我会把收入、客户和长期能力转化为可比较的目标与问题，按影响、信心、成本和风险排序。季度内设置结果里程碑和复盘点，对未入选需求说明机会成本与重新评估条件。",
      ],
      followUps: [
        [
          "priority",
          "两个高优需求冲突时你如何排序？",
          "如果最大客户以流失威胁要求插队，你如何判断并与销售共同承担决定？",
          "优先级框架合理，商业风险量化仍可加强。",
          "我会量化客户价值、流失概率、战略复用性和延期成本，并与销售共同确认事实和承诺边界。",
        ],
        [
          "change",
          "季度中目标变化时你如何调整路线图？",
          "如果频繁调整已伤害团队信任，你如何证明这次变化值得？",
          "调整机制清楚，团队信任修复仍可具体。",
          "我会说明新证据和不调整的代价，保护进行中的关键工作，并通过稳定的复盘机制减少随意变化。",
        ],
      ],
    }),
  ],
}

const catalogs = {
  role_frontend_bytedance: frontendCatalog,
  role_product_manager_meituan: productCatalog,
} satisfies Record<string, RoleQuestionCatalog>

export const supportedInterviewRoundsByTargetRoleId = Object.fromEntries(
  Object.entries(catalogs).map(([roleId, catalog]) => [roleId, catalog.supportedRounds]),
) as Record<keyof typeof catalogs, [InterviewRound, ...InterviewRound[]]>

function getCatalog(targetRoleId: string) {
  return catalogs[targetRoleId as keyof typeof catalogs]
}

function questionsForRound(catalog: RoleQuestionCatalog, round: InterviewRound) {
  if (round === "hr") return catalog.hr
  if (round === "technical") {
    if (catalog.technical === undefined) {
      throw new Error("Interview round is not supported by the target role.")
    }
    return catalog.technical
  }
  if (round === "comprehensive") {
    const professional = catalog.technical ?? catalog.business
    return [catalog.hr[0], professional[0], catalog.business[1]]
  }
  if (round === "manager") {
    return [catalog.business[2], catalog.business[1], catalog.business[0]]
  }
  if (round === "final") {
    return [catalog.business[1], catalog.business[2], catalog.business[0]]
  }
  return catalog.business
}

function questionId(targetRoleId: string, key: string) {
  return `interview-question-${targetRoleId}-${key}`
}

function followUpId(targetRoleId: string, questionKey: string, followUpKey: string) {
  return `interview-follow-up-${targetRoleId}-${questionKey}-${followUpKey}`
}

function requestedFollowUps(scenario: InterviewAgentMockScenario, questionIndex: number) {
  if (scenario === "singleFollowUp" && questionIndex === 1) return 1
  if (scenario === "multipleFollowUps" && questionIndex === 1) return 2
  if (scenario === "lastQuestionFollowUp" && questionIndex === 1) return 1
  return 0
}

export function createInterviewAgentPlanMock(
  input: InterviewConfiguration & { scenario: InterviewAgentMockScenario },
): MockInterviewAgentPlan {
  const catalog = getCatalog(input.targetRoleId)
  if (catalog === undefined) throw new Error("Interview target role has no question catalog.")
  if (!catalog.supportedRounds.includes(input.round)) {
    throw new Error("Interview round is not supported by the target role.")
  }

  const entries = questionsForRound(catalog, input.round)
  const questionCount =
    input.scenario === "noFollowUps" || input.scenario === "lastQuestionFollowUp" ? 2 : 3
  const questions = entries.slice(0, questionCount).map((entry, questionIndex) => {
    const id = questionId(input.targetRoleId, entry.key)
    const followUpCount = Math.min(
      requestedFollowUps(input.scenario, questionIndex),
      input.difficulty === "pressure" ? 2 : 1,
    )
    return {
      question: {
        id,
        prompt: input.difficulty === "pressure" ? entry.pressurePrompt : entry.basicPrompt,
        type: entry.type,
        assessedCapabilities: [...entry.assessedCapabilities],
        order: questionIndex + 1,
      },
      followUps: entry.followUps.slice(0, followUpCount).map((followUpEntry, followUpIndex) => ({
        id: followUpId(input.targetRoleId, entry.key, followUpEntry.key),
        parentQuestionId: id,
        prompt:
          input.difficulty === "pressure"
            ? followUpEntry.pressurePrompt
            : followUpEntry.basicPrompt,
        order: followUpIndex + 1,
        createdAt: `2026-07-24T02:${String(4 + followUpIndex).padStart(2, "0")}:00.000Z`,
      })),
    }
  })
  const adjustedPlan = input.scenario === "adjustedPlan"

  return structuredClone({
    scenario: input.scenario,
    initialProgress: {
      totalMainQuestions:
        input.scenario === "unknownTotal" ? null : adjustedPlan ? 2 : questionCount,
      planRevision: 1,
    },
    planChanges: adjustedPlan
      ? [{ afterCompletedMainQuestions: 1, totalMainQuestions: 3, planRevision: 2 }]
      : [],
    questions,
  })
}

function findQuestion(questionIdToFind: string) {
  for (const [targetRoleId, catalog] of Object.entries(catalogs)) {
    for (const entry of [...catalog.hr, ...catalog.business, ...(catalog.technical ?? [])]) {
      if (questionId(targetRoleId, entry.key) === questionIdToFind) return entry
    }
  }
  return undefined
}

function findFollowUp(followUpIdToFind: string) {
  for (const [targetRoleId, catalog] of Object.entries(catalogs)) {
    for (const entry of [...catalog.hr, ...catalog.business, ...(catalog.technical ?? [])]) {
      for (const followUpEntry of entry.followUps) {
        if (followUpId(targetRoleId, entry.key, followUpEntry.key) === followUpIdToFind) {
          return followUpEntry
        }
      }
    }
  }
  return undefined
}

export function getInterviewQuestionReviewTemplate(questionIdToFind: string) {
  const entry = findQuestion(questionIdToFind)
  if (entry === undefined) {
    throw new Error(`Missing interview review fixture for question ${questionIdToFind}.`)
  }
  return structuredClone(entry.review)
}

export function getInterviewQuestionReferenceAnswer(questionIdToFind: string) {
  return structuredClone(findQuestion(questionIdToFind)?.referenceAnswer)
}

export function getInterviewFollowUpReviewTemplate(followUpIdToFind: string) {
  const entry = findFollowUp(followUpIdToFind)
  if (entry === undefined) {
    throw new Error(`Missing interview follow-up review fixture for ${followUpIdToFind}.`)
  }
  return structuredClone(entry.review)
}

export function getInterviewFollowUpReferenceAnswer(followUpIdToFind: string) {
  return structuredClone(findFollowUp(followUpIdToFind)?.referenceAnswer)
}

export function getInterviewMockAnswer(questionIdToFind: string) {
  return findQuestion(questionIdToFind)?.mockAnswer ?? "我会结合实际约束说明判断、行动和结果。"
}
