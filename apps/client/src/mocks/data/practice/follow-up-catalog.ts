import type {
  AnsweredPracticeFollowUpExchange,
  PracticeAnswer,
  PracticeFollowUpQuestion,
  PracticeFollowUpReferenceAnswer,
  PracticeQuestionCard,
} from "@/models/practice"

import type { MockPracticeQuestionTemplateId } from "./question-catalog"
import { getMockQuestionTemplateId } from "./types"
import type { GeneratedPracticeFollowUpTemplate } from "./types"

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
  MockPracticeQuestionTemplateId,
  readonly GeneratedPracticeFollowUpTemplate[]
>

export type MockPracticeFollowUpTemplateId =
  (typeof practiceFollowUpTemplates)[MockPracticeQuestionTemplateId][number]["id"]

export function getPracticeFollowUpPlan(
  templateId: string,
): readonly GeneratedPracticeFollowUpTemplate[] {
  return isMockPracticeQuestionTemplateId(templateId) ? practiceFollowUpTemplates[templateId] : []
}

function isMockPracticeQuestionTemplateId(
  templateId: string,
): templateId is MockPracticeQuestionTemplateId {
  return Object.hasOwn(practiceFollowUpTemplates, templateId)
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
  const templateId = getMockQuestionTemplateId(question)
  const template = getPracticeFollowUpPlan(templateId)[order - 1]
  if (!template) throw new Error("Practice follow-up order is outside the mock plan.")
  if (!template.id.startsWith(`${templateId}.`)) {
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
  const templateId = getMockQuestionTemplateId(mainQuestion)
  const template = getPracticeFollowUpPlan(templateId).find(
    ({ id }) => id === currentFollowUp.templateId,
  )
  if (!template || !currentFollowUp.templateId.startsWith(`${templateId}.`)) {
    throw new Error("Practice follow-up template does not match its main question.")
  }

  const previousContext = previousFollowUpExchanges.length
    ? `此前追问回答为：${previousFollowUpExchanges
        .map(({ question, answer }) => `“${question.prompt}”→“${answer.content}”`)
        .join("；")}。补充时应承接已有信息，避免重复。`
    : "这是本题第一道追问，补充时应直接承接主回答。"
  const context = `针对目标岗位“${targetRoleTitle}”和主问题“${mainQuestion.prompt}”，用户主回答为“${mainAnswer.content.trim()}”；当前追问为“${currentFollowUp.prompt}”。推荐材料是“${mainQuestion.recommendedMaterials.map(({ label }) => label).join("、")}”。${previousContext}`

  return {
    ...structuredClone(template.referenceAnswer),
    answer: `${context}${template.referenceAnswer.answer}`,
    generatedAt: "2026-07-20T03:00:00.000Z",
  }
}
