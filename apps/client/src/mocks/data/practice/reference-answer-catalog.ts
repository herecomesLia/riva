import type { PracticeQuestionType, PracticeReferenceAnswer } from "@/models/practice"

import type { MockPracticeQuestionTemplateId } from "./question-catalog"

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
  MockPracticeQuestionTemplateId,
  Omit<PracticeReferenceAnswer, "generatedAt">
>

export function createPracticeReferenceAnswer({
  templateId,
  questionType,
  targetRoleTitle,
  questionPrompt,
  recommendedMaterials,
}: {
  templateId: string
  questionType: PracticeQuestionType
  targetRoleTitle: string
  questionPrompt: string
  recommendedMaterials: string[]
}): PracticeReferenceAnswer {
  if (!isMockPracticeQuestionTemplateId(templateId)) {
    throw new Error("Practice reference answer template is not in the mock catalog.")
  }
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

function isMockPracticeQuestionTemplateId(
  templateId: string,
): templateId is MockPracticeQuestionTemplateId {
  return Object.hasOwn(referenceAnswerTemplates, templateId)
}
