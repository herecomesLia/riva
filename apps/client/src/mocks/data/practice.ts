import type {
  ActivePracticeSelection,
  AnsweredPracticeFollowUpExchange,
  PracticeAnswer,
  PracticeAttemptRecord,
  PracticeDimensionScore,
  PracticeEvaluation,
  PracticeEvaluatingState,
  PracticeFollowUpReferenceAnswer,
  PracticeFollowUpQuestion,
  PracticeFollowUpTemplateId,
  PracticePageResponse,
  PracticeQuestionCard,
  PracticeQuestionTemplateId,
  PracticeQuestionType,
  PracticeReferenceAnswer,
  PracticeRecommendation,
  PracticeReview,
  PracticeReviewState,
  PracticeScoreDimension,
  PracticeSetupContext,
} from "@/models/practice"
import { derivePracticeSupportedQuestionTypes } from "@/mocks/data/role-fixture-builders"
import { createRolesMockResponse } from "@/mocks/data/roles"

const rolesFixture = createRolesMockResponse("multipleRoles")
const targetRoles = rolesFixture.roles
  .filter((role) => role.preparationStatus !== "archived")
  .map((role) => ({
    id: role.id,
    title: role.title,
    company: role.company,
    supportedQuestionTypes: derivePracticeSupportedQuestionTypes(role),
  })) satisfies PracticeSetupContext["targetRoles"]

const setupContext = {
  targetRoles,
  defaultTargetRoleId: rolesFixture.currentRoleId,
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
  id: PracticeQuestionTemplateId
  prompt: string
  assessedCapabilities: readonly string[]
  recommendedMaterials: readonly string[]
}

type GeneratedQuestionGuidanceTemplate = {
  hints: readonly string[]
  framework: readonly string[]
}

export type GeneratedPracticeFollowUpTemplate = {
  id: PracticeFollowUpTemplateId
  prompt: string
  answerHints: readonly string[]
  answerFramework: readonly string[]
  referenceAnswer: Omit<PracticeFollowUpReferenceAnswer, "generatedAt">
}

const generatedQuestionTemplates = {
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
} satisfies Record<PracticeQuestionType, readonly GeneratedQuestionTemplate[]>

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

const referenceAnswerTemplates = {
  "projectDeepDive.performanceOptimization": {
    kind: "personalizedExample",
    answer:
      "我会选用推荐材料中的“全球电商结算页性能优化项目”来回答。项目目标是改善结算页在中低端设备上的交互体验，我负责定位前端瓶颈并推动方案落地。我先按设备与网络条件拆分性能数据，结合性能监控和调用链确认主要耗时来自首屏包体与非关键请求竞争。评估整包重构和渐进优化后，我选择先拆分非关键模块、调整请求优先级，并与产品和服务端共同确定灰度范围。上线时按设备分层观察 P75 可交互时间、退出率和异常率，用灰度组与对照组验证变化；结果以项目已有监控数据为准。复盘时我会补充说明方案的适用边界、回滚信号，以及后续如何把一次优化沉淀成持续监控机制。",
    keyPoints: [
      "界定个人职责与业务目标",
      "用分层数据定位瓶颈并解释取舍",
      "通过灰度对照和监控验证结果",
    ],
    commonMistakes: ["只罗列团队动作，没有说明个人判断", "编造项目中不存在的指标或成果"],
  },
  "projectDeepDive.complexProjectTradeoff": {
    kind: "personalizedExample",
    answer:
      "我会选择推荐材料中的性能监控平台建设经历。先说明项目为何复杂：它需要兼顾业务接入速度、监控数据质量和长期维护成本，我负责核心方案比较与推进。备选方案包括由各业务自行接入、统一封装全量能力，或先建立最小公共采集层再逐步扩展。我会把接入成本、可观测性、兼容风险和演进空间列成决策依据，选择可分阶段验证的方案，并明确哪些需求暂不纳入。面对业务方希望快速上线、工程团队担心维护负担的阻力，我会用接口契约、试点范围和退出条件对齐预期。最终结果只引用现有材料中可核实的交付证据，并说明哪些假设通过试点得到验证、哪些取舍需要后续调整。",
    keyPoints: [
      "比较备选方案与明确决策依据",
      "呈现个人推动动作和所遇阻力",
      "用试点证据验证取舍而不虚构结果",
    ],
    commonMistakes: ["只描述复杂度，没有交代最终取舍", "把团队决定笼统说成个人贡献"],
  },
  "behavioral.stakeholderConflict": {
    kind: "personalizedExample",
    answer:
      "我会使用推荐材料中的跨团队项目协作经历。面对关键协作方对发布范围的分歧，我先把双方共同目标、各自约束和不可接受风险写清楚，再分别确认分歧究竟来自数据判断还是交付压力。作为推进人，我提出用小范围验证代替一次性争论：先约定成功指标、观察周期和停止条件，再让各方共同评审结果。这个过程让讨论从立场转向证据，也保留了必要的风险控制。最终结果应只陈述现有经历中能够核实的交付和影响；复盘时我会说明，如果重来，我会更早暴露依赖并预留决策时间。",
    keyPoints: [
      "明确冲突情境、个人任务和各方约束",
      "用共同目标与小范围验证推动共识",
      "呈现可核实结果并给出复盘",
    ],
    commonMistakes: ["把冲突描述成对方的问题", "只说善于沟通而没有具体行动"],
  },
  "behavioral.incidentUnderPressure": {
    kind: "personalizedExample",
    answer:
      "我会使用推荐材料中的线上突发事件处理经历。高压期限内出现异常后，我先确认用户影响、数据风险和时间窗口，把恢复核心能力设为第一优先级，并暂停可能扩大影响的非必要发布。我的职责是建立统一信息面板、按排查路径分配负责人，并约定固定同步节奏，避免多人重复尝试。资源协调上，我会让最熟悉链路的人定位根因，安排另一组准备可逆的止损方案，同时请业务方确认可以接受的功能降级边界。影响稳定后再补齐根因验证、受影响范围和后续行动；结果只使用事故记录中已有事实。复盘重点是告警为何未提前发现、决策信息是否充分，以及怎样缩短下一次恢复时间。",
    keyPoints: [
      "按用户影响和风险确定优先级",
      "明确分工、同步节奏与资源协调",
      "先止损再验证根因并复盘",
    ],
    commonMistakes: ["在高压场景中同时推进所有事项", "只强调加班，没有说明判断和影响控制"],
  },
  "businessUnderstanding.priorityAdjustment": {
    kind: "personalizedExample",
    answer:
      "我会从推荐材料中的核心指标改进项目切入。先明确业务目标、目标用户和当前最关键的结果指标，再说明原计划为何不足以支持目标。我负责收集数据与交付约束，将候选事项按预期影响、证据强度、实现成本和依赖关系排序，并与产品及交付团队确认调整范围。决策时我会说明被推迟事项的机会成本、调整后的验证窗口和恢复条件。落地后只引用项目已有指标和事实比较结果；若结果不符合预期，就回到原假设和优先级依据复盘，而不是把所有变化都归因于这次调整。",
    keyPoints: [
      "从业务目标和目标用户定义问题",
      "比较收益、成本、风险与可逆性",
      "用指标窗口和回退条件验证决策",
    ],
    commonMistakes: ["把业务理解等同于追求单一收入指标", "没有说明利益相关方和风险边界"],
  },
  "businessUnderstanding.experienceVsRevenueTradeoff": {
    kind: "personalizedExample",
    answer:
      "我会先把用户体验损失和短期业务收益转成可比较的指标，并区分影响人群、持续时间与可逆性。接着与产品、运营、研发和客服确认各方约束：收益机会是否有明确窗口，体验问题是否会损害留存、信任或服务成本。方案上不会只做二选一，而会比较全量上线、分层试验、降低打扰强度和暂缓上线等选择，评估收益、开发成本、声誉风险与回退难度。我倾向先用小范围、可回退的实验验证关键假设，提前定义停止条件和护栏指标，再依据证据推动决策。示例只使用现有核心指标改进项目中的真实材料，不补造收入或留存数字。",
    keyPoints: [
      "量化体验与收益并识别利益相关方",
      "比较收益、成本、风险和可逆性",
      "用护栏指标与停止条件推动决策",
    ],
    commonMistakes: ["默认短期收入一定优先", "只谈用户感受而不说明业务和验证方式"],
  },
  "motivation.roleMotivation": {
    kind: "personalizedExample",
    answer:
      "我希望应聘当前目标岗位，是因为岗位同时要求复杂问题分析、工程化建设和跨团队推动，这与我在性能优化及监控平台建设中的积累直接相连。过去的经历让我确认，我最有动力解决的不是单个页面问题，而是把定位方法、质量标准和协作机制沉淀为团队可复用的能力。基于当前可用材料，我能贡献的是性能治理、前端基础设施设计和用证据推动技术决策的经验。下一阶段我希望承担更完整的决策责任，但不会把尚未经历过的业务或成果包装成既有经验；我会坦诚说明能力边界和入职后的学习计划。",
    keyPoints: [
      "把岗位吸引力与真实经历连接",
      "说明可贡献价值和下一阶段目标",
      "坦诚能力边界与学习计划",
    ],
    commonMistakes: ["只表达对公司或技术的泛泛兴趣", "用虚构经历证明岗位匹配"],
  },
  "motivation.careerDirection": {
    kind: "personalizedExample",
    answer:
      "我选择这个职业方向，是因为过去在复杂问题分析、工程建设和跨团队协作中的经历让我确认，自己最有动力的工作是把一次问题解决沉淀为可复用的方法。职业选择关键节点不是一句抽象兴趣，而是我在相关项目中逐渐承担更多判断与推动责任的过程。当前目标岗位连接了两端：一端是我已经具备且能用真实材料证明的能力，另一端是我希望继续发展的业务判断和系统性责任。长期规划上，我希望持续提升解决问题的范围与质量，而不是追逐职位名称；我也会坦诚说明目前经验边界以及进入岗位后需要补足的领域。",
    keyPoints: [
      "用真实选择节点解释职业方向",
      "连接已有能力、当前岗位和长期规划",
      "说明发展边界与下一步行动",
    ],
    commonMistakes: ["把长期规划说成固定职位时间表", "职业方向与当前岗位之间没有证据连接"],
  },
  "technicalFoundation.reactRepeatedRendering": {
    kind: "technicalReference",
    answer:
      "React 重复渲染首先要区分“组件函数再次执行”和“浏览器产生多余绘制”。常见原因包括父组件更新向下传播、Context value 或对象/函数引用不稳定、订阅粒度过粗，以及 effect 更新状态形成额外渲染；开发环境下 Strict Mode 的重复调用也不能直接当作生产问题。排查时先用 React DevTools Profiler 记录交互，确认触发源、提交次数和耗时，再检查 props 引用、Context 更新与 effect 依赖。优化应从缩小状态与订阅范围开始，只有在渲染成本确实较高且输入可稳定时再使用 memo、useMemo 或 useCallback，因为缓存本身有复杂度和比较成本。边界上要避免为消除所有函数执行而牺牲正确性，也要分别验证开发与生产构建。最终用相同场景下的 Profiler commit、交互耗时和浏览器性能数据对比，并通过功能测试确认没有引入陈旧闭包或状态不同步。",
    keyPoints: [
      "区分 React 渲染、提交与浏览器绘制",
      "用 Profiler 定位更新来源和真实成本",
      "优先缩小状态范围，再权衡记忆化",
      "在生产构建与一致场景中验证",
    ],
    commonMistakes: [
      "把 Strict Mode 开发期行为直接判定为线上缺陷",
      "无差别添加 memo 和 useCallback",
      "只看渲染次数，不验证交互耗时与正确性",
    ],
  },
  "technicalFoundation.requestLayerDesign": {
    kind: "technicalReference",
    answer:
      "长期演进的数据请求层应先建立端到端类型安全：以服务契约或 schema 生成请求参数、响应和错误类型，在运行时对不可信响应做校验，避免只靠 TypeScript 断言。缓存 key 必须由资源身份和所有影响结果的参数稳定组成；失效策略按数据新鲜度选择主动失效、基于时间的过期或服务端事件同步，并明确 mutation 后如何更新或失效相关查询。并发方面要处理请求去重、取消、乱序响应和乐观更新回滚，用请求版本或库提供的 mutation 上下文防止旧响应覆盖新状态。错误应区分网络、认证、限流、业务校验和未知服务错误，由请求层标准化，再由页面错误边界决定局部提示或整体恢复。重试只用于幂等且可能瞬时恢复的错误，采用有限次数与退避，不能重试业务错误或无幂等保障的写操作。状态一致性上明确服务端状态与本地草稿的所有权，避免多份缓存成为事实来源。接口通过传入 transport、时钟等依赖保持可测试，并用契约测试、竞态测试和缓存失效测试验证。方案取舍上，通用封装应覆盖稳定的横切能力，业务策略留在领域层，避免把请求层做成无法演进的万能抽象。",
    keyPoints: [
      "请求与响应契约、运行时校验和端到端类型安全",
      "稳定缓存 key、失效策略与 mutation 后一致性",
      "请求去重、取消、乱序响应和竞态控制",
      "错误分类、错误边界与幂等重试策略",
      "依赖注入、契约测试和长期演进取舍",
    ],
    commonMistakes: [
      "只声明 TypeScript 类型却不校验真实响应",
      "缓存 key 遗漏参数或 mutation 后全量清空缓存",
      "所有错误统一无限重试",
      "旧请求响应覆盖较新的用户状态",
    ],
  },
} as const satisfies Record<
  PracticeQuestionTemplateId,
  Omit<PracticeReferenceAnswer, "generatedAt">
>

export function createPracticeReferenceAnswer({
  templateId,
  questionType,
  targetRoleTitle,
  questionPrompt,
  recommendedMaterials,
}: {
  templateId: PracticeQuestionTemplateId
  questionType: PracticeQuestionType
  targetRoleTitle: string
  questionPrompt: string
  recommendedMaterials: string[]
}): PracticeReferenceAnswer {
  const template = structuredClone(referenceAnswerTemplates[templateId])
  const expectedPrefix = `${questionType}.`
  if (!templateId.startsWith(expectedPrefix)) {
    throw new Error("Practice question template does not match its question type.")
  }
  const context = `围绕问题“${questionPrompt}”，针对目标岗位“${targetRoleTitle}”，可用材料为“${recommendedMaterials.join("、")}”。`
  return {
    ...template,
    answer:
      template.kind === "personalizedExample" ? `${context}${template.answer}` : template.answer,
    generatedAt: "2026-07-20T03:00:00.000Z",
  }
}

export const practiceFollowUpTemplates = {
  "projectDeepDive.performanceOptimization": [
    {
      id: "projectDeepDive.performanceOptimization.resultAttribution",
      prompt: "你如何验证结果主要来自你的关键决策，而不是同期的其他变化？",
      answerHints: ["说明同期还发生了哪些变化", "给出对照或分层证据", "界定你的决策影响范围"],
      answerFramework: ["归因结论", "对照证据", "排除干扰", "判断边界"],
      referenceAnswer: {
        kind: "personalizedSupplement",
        addressedGap: "结果归因证据不足，尚未排除同期变化的影响。",
        answer:
          "可以基于真实项目补充：先列出上线同期可能影响结果的产品、流量或服务端变化，再说明你实际采用的灰度、设备分层、时间窗口或对照组。对比关键决策覆盖与未覆盖人群的指标变化，并明确哪些结果可以合理归因、哪些仍只能视为相关性；如没有严格实验，应坦诚证据边界，而不是补造指标。",
        keyPoints: ["识别同期干扰因素", "使用可复核的对照证据", "区分相关性与因果归因"],
        commonMistakes: ["只重复最终指标", "把团队整体结果全部归为个人贡献", "虚构实验或数据"],
      },
    },
    {
      id: "projectDeepDive.performanceOptimization.stakeholderDisagreement",
      prompt: "推进性能方案时最大的分歧是什么，你具体如何促成团队达成一致？",
      answerHints: ["点明分歧双方与核心诉求", "说明你提供的证据或小实验", "交代共同决策与后续约束"],
      answerFramework: ["分歧焦点", "各方约束", "你的推动动作", "共识与验证"],
      referenceAnswer: {
        kind: "personalizedSupplement",
        addressedGap: "缺少推动性能方案落地时的个人协作动作。",
        answer:
          "可以从真实分歧切入，例如性能收益与改造成本、发布时间或稳定性之间的取舍。补充你如何把争论拆成可验证问题，使用已有监控或低风险试点降低不确定性，并与相关方提前约定成功指标、灰度范围和回滚条件。最后说明形成了什么共识以及你个人负责了哪一段推动工作。",
        keyPoints: ["具体利益相关方和诉求", "用证据缩小分歧", "明确个人推动与共同决策"],
        commonMistakes: ["只说加强沟通", "把协作方描述成阻碍者", "省略方案代价与风险"],
      },
    },
  ],
  "projectDeepDive.complexProjectTradeoff": [
    {
      id: "projectDeepDive.complexProjectTradeoff.decisionCriteria",
      prompt: "你比较过哪些技术方案，最终取舍所依据的优先级和边界是什么？",
      answerHints: ["列出真实备选方案", "说明统一比较维度", "明确没有选择其他方案的原因"],
      answerFramework: ["核心约束", "备选方案", "比较证据", "选择与边界"],
      referenceAnswer: {
        kind: "personalizedSupplement",
        addressedGap: "技术取舍缺少备选方案、决策标准和适用边界。",
        answer:
          "可以补充真实参与过的两个或三个方案，并统一从交付周期、接入成本、性能、可靠性和长期维护等维度比较。说明当时最优先的约束、哪些代价可以接受、哪些风险不能接受，以及为什么当前方案只在这些条件下成立。没有实际采用的方案也只描述当时掌握的证据，不补造验证结果。",
        keyPoints: ["真实备选方案", "一致的比较维度", "决策边界和可接受代价"],
        commonMistakes: ["只描述最终方案", "事后把选择包装成显然正确", "忽略长期维护成本"],
      },
    },
    {
      id: "projectDeepDive.complexProjectTradeoff.resistanceHandling",
      prompt: "方案落地遇到的最大阻力是什么，你如何调整计划并验证风险可控？",
      answerHints: ["区分技术风险与组织阻力", "说明计划调整", "给出验证和回滚信号"],
      answerFramework: ["核心阻力", "影响判断", "计划调整", "验证与复盘"],
      referenceAnswer: {
        kind: "personalizedSupplement",
        addressedGap: "复杂项目的阻力处理与风险验证不够具体。",
        answer:
          "可以说明真实阻力来自兼容风险、资源排期、迁移成本还是责任边界，再补充你如何缩小首批范围、拆分里程碑或建立兼容层。用真实存在的验收、监控和回滚条件说明风险如何被逐步验证，并交代调整后对目标和进度产生的实际影响。",
        keyPoints: ["识别阻力来源", "用阶段计划降低不确定性", "用明确证据验证风险"],
        commonMistakes: ["把所有阻力归因于他人", "只强调加班推进", "没有失败信号和退出条件"],
      },
    },
  ],
  "behavioral.stakeholderConflict": [
    {
      id: "behavioral.stakeholderConflict.reflection",
      prompt: "如果重新处理这次分歧，你会调整哪一个具体行动，为什么？",
      answerHints: ["选择一个真实不足", "解释当时信号", "说明调整后如何验证"],
      answerFramework: ["复盘结论", "遗漏信号", "调整动作", "预期验证"],
      referenceAnswer: {
        kind: "personalizedSupplement",
        addressedGap: "缺少对协作分歧的具体复盘和可执行改进。",
        answer:
          "可以选择一个确实存在的不足，例如过晚确认共同目标、没有提前同步风险或证据表达不够贴近对方诉求。说明当时有哪些信号提示你应该调整，再给出下次会提前采取的一个动作，以及用什么反馈或结果判断沟通是否有效。重点是展示学习，而不是声称结果一定更好。",
        keyPoints: ["承认具体不足", "连接当时信号", "形成可验证的改进行动"],
        commonMistakes: ["泛泛说加强沟通", "把复盘写成再次证明自己正确", "虚构对方反馈"],
      },
    },
  ],
  "behavioral.incidentUnderPressure": [
    {
      id: "behavioral.incidentUnderPressure.priorityDecision",
      prompt: "突发问题信息不完整时，你优先保护了什么，又依据哪些信号动态调整优先级？",
      answerHints: ["说明最先保护的目标", "列出当时可获得的信号", "交代优先级变化与影响控制"],
      answerFramework: ["首要目标", "现场信号", "优先级决策", "动态调整与复盘"],
      referenceAnswer: {
        kind: "personalizedSupplement",
        addressedGap: "高压事件中的优先级依据和动态调整过程不清楚。",
        answer:
          "可以按真实事件说明你首先保护的是用户数据、核心交易、影响面还是恢复时间，并列出当时能获得的告警、调用链、用户反馈或变更记录。补充你如何在止损、定位和恢复之间分配人员，什么新证据触发了优先级调整，以及如何同步决策和控制影响。不要把高压事件误写成一般协作冲突。",
        keyPoints: ["明确首要保护目标", "基于现场证据排序", "记录触发调整的信号和影响"],
        commonMistakes: [
          "按固定流程罗列动作",
          "忽略信息不完整时的判断",
          "用冲突处理文案代替事件响应",
        ],
      },
    },
  ],
  "businessUnderstanding.priorityAdjustment": [
    {
      id: "businessUnderstanding.priorityAdjustment.validation",
      prompt: "优先级调整后，你用什么领先和滞后指标验证判断，并决定继续还是纠偏？",
      answerHints: ["连接业务目标和指标", "区分短期信号与最终结果", "说明纠偏阈值"],
      answerFramework: ["判断目标", "领先指标", "结果指标", "继续或纠偏"],
      referenceAnswer: {
        kind: "personalizedSupplement",
        addressedGap: "优先级调整缺少分阶段验证和纠偏机制。",
        answer:
          "可以从真实业务目标出发，说明早期用哪些过程或行为指标判断方向，后续用哪些结果指标验证业务影响。补充观察窗口、必要的分群或对照，以及何种信号会促使你继续、缩小范围或恢复原优先级。指标名称和数值应来自实际项目；若没有数据，要明确采用了什么定性证据。",
        keyPoints: ["指标与业务目标一致", "分阶段验证", "预先定义纠偏条件"],
        commonMistakes: ["只看单一最终指标", "把相关波动当作决策效果", "没有调整机制"],
      },
    },
  ],
  "businessUnderstanding.experienceVsRevenueTradeoff": [
    {
      id: "businessUnderstanding.experienceVsRevenueTradeoff.guardrails",
      prompt: "如果选择短期收益方案，你会设置哪些体验护栏、触发条件和退出机制？",
      answerHints: ["界定不可牺牲的体验底线", "说明分群与观察窗口", "给出停止和回滚条件"],
      answerFramework: ["核心风险", "触发条件", "护栏方案", "验证与退出"],
      referenceAnswer: {
        kind: "personalizedSupplement",
        addressedGap: "用户体验与收益取舍缺少护栏和可逆决策设计。",
        answer:
          "可以先明确短期收益方案可能伤害的用户群和关键体验指标，再设置曝光上限、频次、核心任务成功率、投诉或留存等真实可获得的护栏。通过小流量、分群和有限观察窗口验证收益，同时预先约定停止扩量、回退或重新设计的触发条件。最终决策应同时呈现收益与体验代价，而不是把任何一方绝对化。",
        keyPoints: ["识别受影响用户", "收益指标与体验护栏并行", "决策可回退"],
        commonMistakes: ["只谈价值观不谈指标", "只看平均收益忽略受损分群", "没有退出机制"],
      },
    },
  ],
  "motivation.roleMotivation": [],
  "motivation.careerDirection": [],
  "technicalFoundation.reactRepeatedRendering": [
    {
      id: "technicalFoundation.reactRepeatedRendering.firstHypothesis",
      prompt: "你会先验证哪个重复渲染假设，如何证明它是真实瓶颈而非开发环境现象？",
      answerHints: ["区分 render、commit 与绘制", "给出首个假设依据", "说明生产场景验证"],
      answerFramework: ["首个假设", "观测证据", "验证实验", "结论边界"],
      referenceAnswer: {
        kind: "technicalReference",
        addressedGap: "缺少对 React 重复渲染首要假设的可证伪验证。",
        answer:
          "先用 React DevTools Profiler 在可复现交互中确认发生的是组件函数执行、commit 还是浏览器绘制，并记录更新来源和耗时。首个假设应由证据决定，例如父组件状态更新、Context value 引用变化、订阅粒度过粗或 effect 触发状态更新。随后只改变一个因素复测，并在生产构建中排除 Strict Mode 的开发期重复调用。只有 commit 或交互耗时改善且功能一致，才说明定位有效。",
        keyPoints: ["Profiler 确认更新来源", "单变量验证假设", "生产构建排除 Strict Mode 干扰"],
        commonMistakes: [
          "把函数执行次数等同于用户性能问题",
          "先加 memo 再找原因",
          "只验证开发构建",
        ],
      },
    },
    {
      id: "technicalFoundation.reactRepeatedRendering.regressionRisk",
      prompt: "应用记忆化或缩小订阅范围后，最可能引入什么回归，你会怎样验证优化边界？",
      answerHints: ["说明陈旧数据或比较成本风险", "覆盖关键交互", "比较正确性与性能"],
      answerFramework: ["回归风险", "触发边界", "验证方案", "上线观察"],
      referenceAnswer: {
        kind: "technicalReference",
        addressedGap: "React 优化方案缺少正确性回归与适用边界验证。",
        answer:
          "记忆化可能因依赖遗漏产生陈旧闭包或陈旧 UI，自定义比较也可能掩盖 prop 变化；缩小订阅范围则可能漏掉必要更新。验证时覆盖输入变化、异步完成、路由切换和 Context 更新等关键路径，使用相同数据集比较 commit 次数、交互耗时与最终 UI。还要评估比较和缓存成本；低成本组件或不稳定输入下，记忆化可能得不偿失。上线后观察性能与错误指标并保留可回退变更。",
        keyPoints: ["验证状态新鲜度", "同时比较性能和正确性", "明确记忆化收益边界"],
        commonMistakes: ["无差别添加 memo", "忽略依赖和闭包", "只看渲染次数"],
      },
    },
  ],
  "technicalFoundation.requestLayerDesign": [
    {
      id: "technicalFoundation.requestLayerDesign.consistencyRisk",
      prompt: "缓存更新与并发请求交错时，如何避免旧响应覆盖新状态并保持一致性？",
      answerHints: ["明确缓存 key 和状态所有权", "处理取消、去重与乱序", "说明 mutation 后一致性"],
      answerFramework: ["一致性风险", "竞态场景", "控制机制", "验证方法"],
      referenceAnswer: {
        kind: "technicalReference",
        addressedGap: "请求层设计缺少缓存一致性和竞态控制细节。",
        answer:
          "缓存 key 必须包含所有影响结果的资源身份和参数，服务端状态与本地草稿要有单一所有权。并发读请求可去重或取消；无法取消时用请求序号、更新时间或库的状态机拒绝旧响应覆盖新快照。mutation 后按资源关系精确更新或失效缓存，乐观更新保存前值并在失败时回滚，同时避免较早的失效请求覆盖提交结果。用可控延迟构造先发后至、后发先至和写后读场景，断言最终缓存与服务端一致。",
        keyPoints: ["稳定缓存 key", "防止乱序响应覆盖", "mutation 更新、失效与回滚一致"],
        commonMistakes: [
          "缓存 key 遗漏参数",
          "只依赖请求完成顺序",
          "mutation 后无差别清空全部缓存",
        ],
      },
    },
    {
      id: "technicalFoundation.requestLayerDesign.failureRecovery",
      prompt: "请求层发生超时、部分失败或服务降级时，错误恢复和长期演进边界如何设计？",
      answerHints: ["区分错误类型与幂等性", "说明降级和恢复入口", "保留领域策略边界"],
      answerFramework: ["失败分类", "恢复策略", "降级边界", "验证与演进"],
      referenceAnswer: {
        kind: "technicalReference",
        addressedGap: "请求层缺少错误恢复、降级和长期演进策略。",
        answer:
          "先把超时、离线、认证、限流、业务校验和未知服务错误标准化，但保留原始类别供上层决策。仅对幂等且可能瞬时恢复的请求做有限退避重试；写操作需要幂等键或明确禁止自动重试。降级可以读取有新鲜度标识的缓存、关闭非核心能力或提供人工重试，但不能把旧数据伪装成成功。错误边界应允许局部恢复并保留用户草稿。通用请求层只承载稳定横切能力，业务降级策略留在领域层，并通过故障注入、离线、超时和恢复测试验证。",
        keyPoints: ["错误分类和幂等重试", "显式降级与数据新鲜度", "基础设施和业务策略分层"],
        commonMistakes: ["所有失败无限重试", "降级时静默返回陈旧数据", "把业务规则塞进通用请求层"],
      },
    },
  ],
} as const satisfies Record<
  PracticeQuestionTemplateId,
  readonly GeneratedPracticeFollowUpTemplate[]
>

export function getPracticeFollowUpPlan(
  templateId: PracticeQuestionTemplateId,
): readonly GeneratedPracticeFollowUpTemplate[] {
  return practiceFollowUpTemplates[templateId]
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
  const template = getPracticeFollowUpPlan(question.templateId)[order - 1]
  if (!template) throw new Error("Practice follow-up order is outside the mock plan.")
  if (!template.id.startsWith(`${question.templateId}.`)) {
    throw new Error("Practice follow-up template does not match its main question.")
  }

  return {
    id: `${question.id}_follow_up_${order}`,
    templateId: template.id,
    prompt: template.prompt,
    createdAt,
    order,
    answerHints: { status: "notRequested", content: null },
    answerFramework: { status: "notRequested", content: null },
    referenceAnswer: {
      status: "notRequested",
      content: null,
      viewedBeforeSubmission: false,
    },
  }
}

export function createPracticeFollowUpReferenceAnswer({
  mainQuestion,
  mainAnswer,
  previousFollowUpExchanges,
  currentFollowUp,
  targetRoleTitle,
}: {
  mainQuestion: PracticeQuestionCard
  mainAnswer: PracticeAnswer
  previousFollowUpExchanges: readonly AnsweredPracticeFollowUpExchange[]
  currentFollowUp: PracticeFollowUpQuestion
  targetRoleTitle: string
}): PracticeFollowUpReferenceAnswer {
  const template = getPracticeFollowUpPlan(mainQuestion.templateId).find(
    ({ id }) => id === currentFollowUp.templateId,
  )
  if (!template || !currentFollowUp.templateId.startsWith(`${mainQuestion.templateId}.`)) {
    throw new Error("Practice follow-up template does not match its main question.")
  }

  const previousContext = previousFollowUpExchanges.length
    ? `此前追问回答为：${previousFollowUpExchanges
        .map(({ question, answer }) => `“${question.prompt}”→“${answer.content}”`)
        .join("；")}。补充时应承接已有信息，避免重复。`
    : "这是本题第一道追问，补充时应直接承接主回答。"
  const context = `针对目标岗位“${targetRoleTitle}”和主问题“${mainQuestion.prompt}”，用户主回答为“${mainAnswer.content.trim()}”；当前追问为“${currentFollowUp.prompt}”。推荐材料是“${mainQuestion.recommendedMaterials.join("、")}”。${previousContext}`

  return {
    ...structuredClone(template.referenceAnswer),
    answer: `${context}${template.referenceAnswer.answer}`,
    generatedAt: "2026-07-20T03:00:00.000Z",
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
  const templates = generatedQuestionTemplates[selection.questionType]
  const template = templates[(ordinal - 1) % templates.length] ?? templates[0]

  return {
    id: `practice_question_${sessionId}_${ordinal}`,
    templateId: template.id,
    prompt: template.prompt,
    questionType: selection.questionType,
    difficulty: selection.difficulty,
    assessedCapabilities: [...template.assessedCapabilities],
    recommendedMaterials: [...template.recommendedMaterials],
    answerHints: { status: "notRequested", content: null },
    answerFramework: { status: "notRequested", content: null },
    referenceAnswer: {
      status: "notRequested",
      content: null,
      viewedBeforeSubmission: false,
    },
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
  const targetRoleTitle =
    targetRoles.find((role) => role.id === session.selection.targetRoleId)?.title ?? "Target role"
  const followUpExchanges = session.followUpExchanges.map((exchange, index) => ({
    ...exchange,
    question: revealFixtureFollowUpReference(
      session,
      exchange.question,
      session.followUpExchanges.slice(0, index),
      targetRoleTitle,
    ),
  }))
  const followUpCompletion =
    session.followUpCompletion.status === "endedEarly"
      ? {
          status: "endedEarly" as const,
          unansweredQuestion: revealFixtureFollowUpReference(
            session,
            session.followUpCompletion.unansweredQuestion,
            session.followUpExchanges,
            targetRoleTitle,
          ),
        }
      : session.followUpCompletion

  return {
    status: "review",
    sessionId: session.sessionId,
    version: session.version + 1,
    selection: session.selection,
    startedAt: session.startedAt,
    attemptId: session.attemptId,
    attemptNumber: session.attemptNumber,
    attemptRecords: session.attemptRecords,
    question: {
      ...session.question,
      referenceAnswer:
        session.question.referenceAnswer.status === "revealed"
          ? session.question.referenceAnswer
          : {
              status: "revealed",
              content: createPracticeReferenceAnswer({
                templateId: session.question.templateId,
                questionType: session.question.questionType,
                targetRoleTitle,
                questionPrompt: session.question.prompt,
                recommendedMaterials: session.question.recommendedMaterials,
              }),
              viewedBeforeSubmission: false,
            },
    },
    mainAnswer: session.mainAnswer,
    followUpExchanges,
    followUpCompletion,
    evaluation: result.evaluation,
    review: result.review,
  }
}

function revealFixtureFollowUpReference(
  session: Pick<PracticeEvaluatingState, "question" | "mainAnswer" | "selection">,
  followUp: PracticeFollowUpQuestion,
  previousFollowUpExchanges: readonly AnsweredPracticeFollowUpExchange[],
  targetRoleTitle: string,
): PracticeFollowUpQuestion {
  if (followUp.referenceAnswer.status === "revealed") return followUp
  return {
    ...followUp,
    referenceAnswer: {
      status: "revealed",
      content: createPracticeFollowUpReferenceAnswer({
        mainQuestion: session.question,
        mainAnswer: session.mainAnswer,
        previousFollowUpExchanges,
        currentFollowUp: followUp,
        targetRoleTitle,
      }),
      viewedBeforeSubmission: false,
    },
  }
}

function createPracticeAttemptFixture(
  base: PracticeAttemptRecord,
  overrides: Partial<PracticeAttemptRecord> = {},
): PracticeAttemptRecord {
  return {
    ...structuredClone(base),
    ...structuredClone(overrides),
  }
}

const archivedProjectAttempt = createPracticeAttemptFixture({
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
})

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
      attemptRecords: [createPracticeAttemptFixture(archivedProjectAttempt)],
      previousAttempt: createPracticeAttemptFixture(archivedProjectAttempt),
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
      markedWeakQuestionCount: 0,
      finalAttemptAverageScore: evaluation.overallScore,
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
        createPracticeAttemptFixture(archivedProjectAttempt),
        createPracticeAttemptFixture(archivedProjectAttempt, {
          attemptId: `${activeSession.sessionId}_attempt_2`,
          attemptNumber: 2,
          evaluation: highScoreEvaluation,
          review: highScoreReview,
        }),
      ],
      completedAt: "2026-07-20T01:41:00.000Z",
      questionsCompleted: 1,
      retryCount: 1,
      savedQuestionCount: 0,
      markedWeakQuestionCount: 0,
      finalAttemptAverageScore: highScoreEvaluation.overallScore,
      nextStepSuggestion: "继续围绕项目深挖补充量化证据，再进入下一轮练习。",
    },
  },
  completedWithWeakQuestions: {
    setupContext,
    session: {
      status: "completed",
      ...activeSession,
      attemptRecords: [
        createPracticeAttemptFixture(archivedProjectAttempt, {
          question: { ...archivedProjectAttempt.question, isMarkedWeak: true },
        }),
      ],
      completedAt: "2026-07-20T01:41:00.000Z",
      questionsCompleted: 1,
      retryCount: 0,
      savedQuestionCount: 0,
      markedWeakQuestionCount: 1,
      finalAttemptAverageScore: evaluation.overallScore,
      nextStepSuggestion: "优先复习本轮标记的薄弱题。",
    },
  },
} satisfies Record<PracticeMockScenario, PracticePageResponse>

export const practiceResponseMock = practiceMockScenarios.setupReady

export function createPracticeMockResponse(
  scenario: PracticeMockScenario = "setupReady",
): PracticePageResponse {
  const response: PracticePageResponse = structuredClone(practiceMockScenarios[scenario])
  if (response.session.status === "review") {
    const reviewSession = response.session
    const roleTitle = response.setupContext.targetRoles.find(
      (role) => role.id === reviewSession.selection.targetRoleId,
    )?.title
    reviewSession.question.referenceAnswer = {
      status: "revealed",
      content: createPracticeReferenceAnswer({
        templateId: reviewSession.question.templateId,
        questionType: reviewSession.question.questionType,
        targetRoleTitle: roleTitle ?? "Target role",
        questionPrompt: reviewSession.question.prompt,
        recommendedMaterials: reviewSession.question.recommendedMaterials,
      }),
      viewedBeforeSubmission: false,
    }
    reviewSession.followUpExchanges = reviewSession.followUpExchanges.map(
      (exchange, index, exchanges) => ({
        ...exchange,
        question: revealFixtureFollowUpReference(
          reviewSession,
          exchange.question,
          exchanges.slice(0, index),
          roleTitle ?? "Target role",
        ),
      }),
    )
    if (reviewSession.followUpCompletion.status === "endedEarly") {
      reviewSession.followUpCompletion.unansweredQuestion = revealFixtureFollowUpReference(
        reviewSession,
        reviewSession.followUpCompletion.unansweredQuestion,
        reviewSession.followUpExchanges,
        roleTitle ?? "Target role",
      )
    }
  }
  if (response.session.status === "completed") {
    for (const record of response.session.attemptRecords) {
      record.question.referenceAnswer = {
        status: "revealed",
        content: createPracticeReferenceAnswer({
          templateId: record.question.templateId,
          questionType: record.question.questionType,
          targetRoleTitle:
            response.setupContext.targetRoles.find(
              (role) => role.id === record.selection.targetRoleId,
            )?.title ?? "Target role",
          questionPrompt: record.question.prompt,
          recommendedMaterials: record.question.recommendedMaterials,
        }),
        viewedBeforeSubmission: false,
      }
      const roleTitle =
        response.setupContext.targetRoles.find((role) => role.id === record.selection.targetRoleId)
          ?.title ?? "Target role"
      record.followUpExchanges = record.followUpExchanges.map((exchange, index, exchanges) => ({
        ...exchange,
        question: revealFixtureFollowUpReference(
          record,
          exchange.question,
          exchanges.slice(0, index),
          roleTitle,
        ),
      }))
      if (record.followUpCompletion.status === "endedEarly") {
        record.followUpCompletion.unansweredQuestion = revealFixtureFollowUpReference(
          record,
          record.followUpCompletion.unansweredQuestion,
          record.followUpExchanges,
          roleTitle,
        )
      }
    }
  }
  return response
}
