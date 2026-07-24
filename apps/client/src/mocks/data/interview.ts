import type {
  CompletedInterviewQuestionResponse,
  GetInterviewReviewResponse,
  InterviewCandidateQuestionExchangeResponse,
  InterviewCompletionReason,
  InterviewCompletedSessionResponse,
  InterviewFollowUpQuestionResponse,
  InterviewFollowUpReviewResponse,
  InterviewPageResponse,
  InterviewProgressResponse,
  InterviewQuestionLearningDetailResponse,
  InterviewQuestionRecordResponse,
  InterviewQuestionReviewResponse,
  InterviewQuestionResponse,
  InterviewPartialReviewResponse,
  InterviewReferenceAnswerContentResponse,
  InterviewReferenceAnswerResponse,
  InterviewReviewResponse,
  InterviewSessionReviewResponse,
  InterviewSetupResponse,
} from "@/models/interview"
import type { JobProfileSnapshot } from "@/models/profile"
import type { RolesPageResponse } from "@/models/roles"

import { createProfileMockSnapshot, profileResponseMock } from "./profile"
import { createRolesMockResponse } from "./roles"

export type InterviewMockScenario =
  "setupReady" | "noTargetRoles" | "prerequisiteNotMet" | "completed"

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

const allInterviewRounds = [
  "hr",
  "firstBusiness",
  "technical",
  "manager",
  "final",
  "comprehensive",
] as const

const nonTechnicalInterviewRounds = [
  "hr",
  "firstBusiness",
  "manager",
  "final",
  "comprehensive",
] as const

export const interviewSetupConfigurationMock = {
  availableDifficulties: ["basic", "pressure"],
  availableDurationMinutes: [15, 30, 45],
  defaultRound: "technical",
  defaultDifficulty: "pressure",
  defaultDurationMinutes: 30,
  defaultSupportedRounds: allInterviewRounds,
  supportedRoundsByTargetRoleId: {
    role_product_manager_meituan: nonTechnicalInterviewRounds,
  },
} as const

export function createInterviewSetupResponseMock(
  rolesResponse: RolesPageResponse,
  profileSnapshot: JobProfileSnapshot,
): InterviewSetupResponse {
  const activeRoles = rolesResponse.roles.filter(
    ({ preparationStatus }) => preparationStatus !== "archived",
  )
  const currentRole = activeRoles.find(({ id }) => id === rolesResponse.currentRoleId)
  const targetRoles = activeRoles.map(({ company, id, title }) => ({
    id,
    title,
    company,
    supportedRounds: [
      ...(interviewSetupConfigurationMock.supportedRoundsByTargetRoleId[
        id as keyof typeof interviewSetupConfigurationMock.supportedRoundsByTargetRoleId
      ] ?? interviewSetupConfigurationMock.defaultSupportedRounds),
    ] as InterviewSetupResponse["targetRoles"][number]["supportedRounds"],
  }))
  const currentInterviewRole = targetRoles.find(({ id }) => id === currentRole?.id)
  const defaultRound = currentInterviewRole?.supportedRounds.includes(
    interviewSetupConfigurationMock.defaultRound,
  )
    ? interviewSetupConfigurationMock.defaultRound
    : (currentInterviewRole?.supportedRounds[0] ?? interviewSetupConfigurationMock.defaultRound)
  const profileComplete =
    profileSnapshot.profile?.status === "active" &&
    profileSnapshot.profile.completeness.percentage === 100
  const availability: InterviewSetupResponse["availability"] =
    !profileComplete && targetRoles.length > 0
      ? { status: "blocked", reason: "profileIncomplete" }
      : targetRoles.length > 0 && currentRole?.jobDescription.status !== "ready"
        ? { status: "blocked", reason: "jobDescriptionMissing" }
        : { status: "available" }

  return structuredClone({
    availability,
    availableDifficulties: [...interviewSetupConfigurationMock.availableDifficulties],
    availableDurationMinutes: [...interviewSetupConfigurationMock.availableDurationMinutes],
    targetRoles,
    defaultConfiguration: {
      targetRoleId: currentRole?.id ?? null,
      round: defaultRound,
      difficulty: interviewSetupConfigurationMock.defaultDifficulty,
      durationMinutes: interviewSetupConfigurationMock.defaultDurationMinutes,
    },
  })
}

export const interviewSetupResponseMock = createInterviewSetupResponseMock(
  createRolesMockResponse("multipleRoles"),
  profileResponseMock,
)

const questionTemplates = {
  selfIntroduction: {
    id: "interview-question-self-introduction",
    prompt: "请你用两分钟做一下自我介绍，并重点说明与高级前端工程师岗位最相关的经历。",
    type: "selfIntroduction",
    assessedCapabilities: ["信息组织", "岗位匹配", "表达重点"],
  },
  projectDeepDive: {
    id: "interview-question-project-deep-dive",
    prompt: "请介绍一次你主导的前端性能优化，说明你如何定位问题、选择方案并验证结果。",
    type: "projectDeepDive",
    assessedCapabilities: ["问题分析", "技术决策", "结果量化"],
  },
  motivation: {
    id: "interview-question-motivation",
    prompt: "为什么选择这个岗位？你希望未来两年在哪些能力上形成明显优势？",
    type: "motivation",
    assessedCapabilities: ["求职动机", "职业规划", "岗位理解"],
  },
  collaboration: {
    id: "interview-question-collaboration",
    prompt: "请举例说明你如何推动一个存在明显分歧的跨团队项目，并最终达成结果。",
    type: "behavioral",
    assessedCapabilities: ["跨团队协作", "冲突处理", "结果推进"],
  },
  roleCapability: {
    id: "interview-question-role-capability",
    prompt: "如果入职后需要你负责核心前端链路的稳定性治理，你会如何制定前三个月的计划？",
    type: "roleCapability",
    assessedCapabilities: ["岗位理解", "规划能力", "风险控制"],
  },
} as const

type QuestionTemplateName = keyof typeof questionTemplates

function createQuestion(name: QuestionTemplateName, order: number): InterviewQuestionResponse {
  const template = questionTemplates[name]
  return {
    ...structuredClone(template),
    assessedCapabilities: [...template.assessedCapabilities],
    order,
  }
}

function createFollowUp(
  id: string,
  parentQuestionId: string,
  prompt: string,
  order: number,
): InterviewFollowUpQuestionResponse {
  return {
    id,
    parentQuestionId,
    prompt,
    order,
    createdAt: `2026-07-24T02:${String(3 + order).padStart(2, "0")}:00.000Z`,
  }
}

export const projectFollowUpQuestionMock = createFollowUp(
  "interview-follow-up-project-evidence",
  questionTemplates.projectDeepDive.id,
  "如果监控数据只能证明性能改善，却无法直接证明业务收益，你会如何补充验证？",
  1,
)

const projectAttributionFollowUpMock = createFollowUp(
  "interview-follow-up-project-attribution",
  questionTemplates.projectDeepDive.id,
  "如果同期还有营销活动和服务端改动，你会如何排除这些因素对结果的影响？",
  2,
)

const motivationFollowUpMock = createFollowUp(
  "interview-follow-up-motivation-criteria",
  questionTemplates.motivation.id,
  "如果实际岗位的发展路径与预期不同，你会用哪些标准判断是否继续投入？",
  1,
)

function planQuestion(
  name: QuestionTemplateName,
  order: number,
  followUps: InterviewFollowUpQuestionResponse[] = [],
) {
  return {
    question: createQuestion(name, order),
    followUps: structuredClone(followUps),
  }
}

export function createInterviewAgentPlanMock(
  scenario: InterviewAgentMockScenario = "singleFollowUp",
): MockInterviewAgentPlan {
  const plans: Record<InterviewAgentMockScenario, MockInterviewAgentPlan> = {
    noFollowUps: {
      scenario,
      initialProgress: { totalMainQuestions: 2, planRevision: 1 },
      planChanges: [],
      questions: [planQuestion("selfIntroduction", 1), planQuestion("collaboration", 2)],
    },
    singleFollowUp: {
      scenario,
      initialProgress: { totalMainQuestions: 3, planRevision: 1 },
      planChanges: [],
      questions: [
        planQuestion("selfIntroduction", 1),
        planQuestion("projectDeepDive", 2, [projectFollowUpQuestionMock]),
        planQuestion("motivation", 3),
      ],
    },
    multipleFollowUps: {
      scenario,
      initialProgress: { totalMainQuestions: 3, planRevision: 1 },
      planChanges: [],
      questions: [
        planQuestion("selfIntroduction", 1),
        planQuestion("projectDeepDive", 2, [
          projectFollowUpQuestionMock,
          projectAttributionFollowUpMock,
        ]),
        planQuestion("roleCapability", 3),
      ],
    },
    lastQuestionFollowUp: {
      scenario,
      initialProgress: { totalMainQuestions: 2, planRevision: 1 },
      planChanges: [],
      questions: [
        planQuestion("selfIntroduction", 1),
        planQuestion("motivation", 2, [motivationFollowUpMock]),
      ],
    },
    unknownTotal: {
      scenario,
      initialProgress: { totalMainQuestions: null, planRevision: 1 },
      planChanges: [],
      questions: [
        planQuestion("selfIntroduction", 1),
        planQuestion("collaboration", 2),
        planQuestion("roleCapability", 3),
      ],
    },
    adjustedPlan: {
      scenario,
      initialProgress: { totalMainQuestions: 2, planRevision: 1 },
      planChanges: [
        {
          afterCompletedMainQuestions: 1,
          totalMainQuestions: 3,
          planRevision: 2,
        },
      ],
      questions: [
        planQuestion("selfIntroduction", 1),
        planQuestion("projectDeepDive", 2),
        planQuestion("roleCapability", 3),
      ],
    },
  }
  return structuredClone(plans[scenario])
}

export const interviewOpeningMessageMock =
  "你好，我是本次模拟面试的面试官。接下来会围绕岗位经历、项目能力和求职动机连续提问，请尽量像正式面试一样作答。"

export const candidateQuestionsPromptMock = "正式提问已经结束。现在请你以候选人身份向面试官提问。"

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

type InterviewQuestionReviewTemplate = Omit<InterviewQuestionReviewResponse, "questionId"> & {
  weaknesses: string[]
  risks: string[]
  communicationSuggestions: string[]
  preparationSuggestions: string[]
}

const questionReviewsById: Record<string, InterviewQuestionReviewTemplate> = {
  "interview-question-self-introduction": {
    score: 84,
    summary: "自我介绍重点明确，经历与目标岗位关联自然，关键成果还可以进一步量化。",
    strengths: ["岗位匹配信息集中", "职业主线清晰"],
    issues: ["关键成果缺少量化证据"],
    weaknesses: ["成果量化表达"],
    risks: ["自我介绍中的关键成果证据不足"],
    communicationSuggestions: ["压缩背景信息，优先说明与岗位最相关的经历和结果"],
    preparationSuggestions: ["补充两项能够证明岗位匹配度的量化成果"],
  },
  "interview-question-project-deep-dive": {
    score: 81,
    summary: "完整说明了性能优化过程，技术取舍清楚，业务验证仍可加强。",
    strengths: ["定位过程完整", "方案取舍具体"],
    issues: ["业务收益缺少对照验证"],
    weaknesses: ["技术项目的业务归因"],
    risks: ["如果被持续追问业务价值，目前证据链不够完整"],
    communicationSuggestions: ["使用对照数据说明改动前后的业务变化"],
    preparationSuggestions: ["补充性能指标与业务指标的关联材料"],
  },
  "interview-question-motivation": {
    score: 80,
    summary: "求职动机真实并能联系岗位要求，未来能力规划可以再具体一些。",
    strengths: ["岗位理解准确", "动机表达真实"],
    issues: ["阶段性成长目标不够具体"],
    weaknesses: ["职业目标的阶段拆解"],
    risks: ["发展预期与岗位实际路径不一致时，判断标准不够明确"],
    communicationSuggestions: ["用短期目标和长期目标分别说明求职动机"],
    preparationSuggestions: ["准备未来两年的分阶段成长目标"],
  },
  "interview-question-collaboration": {
    score: 79,
    summary: "能够说明协作过程与推进动作，分歧解决后的业务结果还可以更具体。",
    strengths: ["协作角色清楚", "推进动作完整"],
    issues: ["最终结果量化不足"],
    weaknesses: ["跨团队结果表达"],
    risks: ["协作案例缺少可验证的最终结果"],
    communicationSuggestions: ["先说明核心分歧，再突出个人推动动作和最终结果"],
    preparationSuggestions: ["补充一个包含冲突处理和结果数据的跨团队案例"],
  },
  "interview-question-role-capability": {
    score: 83,
    summary: "规划覆盖了现状诊断、风险排序和阶段目标，协作机制可以进一步展开。",
    strengths: ["阶段目标明确", "风险意识较强"],
    issues: ["跨团队治理机制不够具体"],
    weaknesses: ["治理机制设计"],
    risks: ["稳定性治理计划缺少明确的协作责任边界"],
    communicationSuggestions: ["按现状、目标、行动和验收标准组织规划回答"],
    preparationSuggestions: ["补充核心链路治理中的责任分工和验收指标"],
  },
}

const referenceAnswersByQuestionId: Record<string, InterviewReferenceAnswerContentResponse> = {
  "interview-question-self-introduction": {
    recommendedStructure: [
      "一句话定位当前角色",
      "选择两段岗位相关经历",
      "用结果证明能力",
      "说明求职方向",
    ],
    keyPoints: ["控制在两分钟内", "优先呈现高级前端岗位相关经验", "至少提供一个可验证结果"],
    exampleAnswer:
      "我有五年前端研发经验，最近两年主要负责交易链路的架构与性能治理。我曾主导核心页面升级，通过监控定位长任务并推进拆包和渲染调度，最终让关键页面的 P75 加载时间下降约 30%。同时我也负责跨团队方案评审和上线风险控制。接下来希望在更复杂的业务中继续提升架构判断和团队影响力。",
    usageGuidance:
      "请结合自己的真实经历替换示例中的职责和结果，它用于提供组织思路，并非唯一正确答案。",
    generatedAt: "2026-07-24T02:20:00.000Z",
  },
  "interview-question-project-deep-dive": {
    recommendedStructure: [
      "交代业务背景与目标",
      "说明定位过程",
      "解释方案取舍",
      "给出验证方法与结果",
    ],
    keyPoints: ["区分现象和根因", "说明个人决策", "同时覆盖技术指标与业务指标"],
    exampleAnswer:
      "项目的核心问题是活动期间首屏变慢并影响转化。我先用真实用户监控按设备和网络分组，确认主要瓶颈来自长任务与资源瀑布；随后比较服务端渲染、拆包和预加载的成本，选择先实施风险可控的拆包与渲染调度。灰度期间同时观察性能和下单漏斗，首屏 P75 下降 32%，转化率提升 1.8%，之后再逐步扩大流量。",
    usageGuidance: "示例强调从问题到验证的证据链，请只使用自己能够解释和证明的数据。",
    generatedAt: "2026-07-24T02:20:00.000Z",
  },
  "interview-question-motivation": {
    recommendedStructure: ["说明岗位吸引点", "连接既有经验", "提出两年成长目标", "说明双方匹配"],
    keyPoints: ["避免只谈公司光环", "目标应可观察", "体现对岗位职责的理解"],
    exampleAnswer:
      "我选择这个岗位，是因为核心链路的复杂度与我过去的性能治理经验高度匹配，同时岗位需要推动跨团队技术项目。未来两年我希望先建立稳定性和性能治理的系统方法，再提升技术规划与协作影响力，能够独立负责一条关键业务链路并带动团队形成可复用机制。",
    usageGuidance: "把岗位吸引点与自己的真实能力目标连接起来，不必照搬示例表述。",
    generatedAt: "2026-07-24T02:20:00.000Z",
  },
  "interview-question-collaboration": {
    recommendedStructure: ["说明分歧背景", "界定个人角色", "描述推进动作", "总结结果与复盘"],
    keyPoints: ["具体说明冲突点", "突出建立共识的方法", "提供最终业务结果"],
    exampleAnswer:
      "在一次结算链路改造中，产品希望快速上线，服务端和前端对风险边界存在分歧。我负责把争议拆成接口稳定性、回滚能力和交付时间三项约束，组织各方用数据确认优先级，并提出分阶段灰度方案。最终项目按期上线且没有产生重大故障，团队随后把这套评审清单固化为跨团队协作模板。",
    usageGuidance: "选择自己真正参与推动的案例，明确个人贡献与团队共同成果。",
    generatedAt: "2026-07-24T02:20:00.000Z",
  },
  "interview-question-role-capability": {
    recommendedStructure: ["诊断现状", "按风险排序", "拆分阶段目标", "定义协作与验收机制"],
    keyPoints: ["先建立可观测性", "说明前三个月节奏", "包含责任边界和验收指标"],
    exampleAnswer:
      "第一个月我会梳理核心链路、补齐监控并建立风险清单；第二个月按业务影响处理最高优先级问题，完成演练与回滚机制；第三个月推动容量、变更和故障复盘制度落地。每个阶段都会明确负责人、交付物和稳定性指标，并与产品和服务端按周同步风险。",
    usageGuidance: "示例提供规划框架，实际回答应结合目标团队现状调整优先级。",
    generatedAt: "2026-07-24T02:20:00.000Z",
  },
  "interview-follow-up-project-evidence": {
    recommendedStructure: ["承认当前证据边界", "设计对照方案", "选择业务指标", "说明观察周期"],
    keyPoints: ["区分相关性与因果性", "使用灰度或同期对照", "提前定义成功标准"],
    exampleAnswer:
      "我会先明确现有监控只能证明性能改善，不能直接证明业务收益。随后按流量或用户群建立灰度对照，保持活动、版本和服务端策略尽量一致，同时观察首屏性能、关键点击率和下单转化。达到预设样本量并持续一个完整业务周期后，再判断性能变化是否带来了稳定收益。",
    usageGuidance: "该示例直接回应业务验证问题，可根据真实实验条件选择合适的对照方法。",
    generatedAt: "2026-07-24T02:20:00.000Z",
  },
  "interview-follow-up-project-attribution": {
    recommendedStructure: ["列出同期变量", "隔离可控因素", "使用分组或分阶段数据", "说明结论限制"],
    keyPoints: ["记录营销和服务端变更时间", "比较不同流量组", "避免过度归因"],
    exampleAnswer:
      "我会建立同期变更时间线，把营销活动、服务端策略和前端版本分别标记；如果条件允许，使用只包含前端改动的灰度组与控制组比较。若无法完全隔离，就按渠道、版本和时间窗口分层分析，并在结论中明确哪些收益可以归因、哪些只能视为相关变化。",
    usageGuidance: "重点是说明归因方法和证据限制，而不是强行证明所有结果都来自单一改动。",
    generatedAt: "2026-07-24T02:20:00.000Z",
  },
  "interview-follow-up-motivation-criteria": {
    recommendedStructure: [
      "定义观察周期",
      "列出核心判断标准",
      "说明沟通与调整动作",
      "给出退出边界",
    ],
    keyPoints: ["同时考虑工作内容和成长反馈", "先主动校准预期", "避免情绪化结论"],
    exampleAnswer:
      "我会用前三到六个月观察实际职责、反馈质量和成长机会是否与核心目标一致。如果路径不同但仍能积累关键能力，我会先与直属负责人校准目标并调整计划；如果长期缺少明确职责、有效反馈和改善空间，再判断是否需要改变投入方向。",
    usageGuidance: "判断标准应体现理性评估与主动沟通，具体周期可结合岗位实际情况调整。",
    generatedAt: "2026-07-24T02:20:00.000Z",
  },
}

const followUpReviewsById: Record<
  string,
  Omit<InterviewFollowUpReviewResponse, "followUpQuestionId">
> = {
  "interview-follow-up-project-evidence": {
    score: 80,
    summary: "能够提出灰度与对照思路，业务指标和观察周期还可以进一步明确。",
    strengths: ["认识到因果证据边界"],
    issues: ["实验成功标准需要提前定义"],
  },
  "interview-follow-up-project-attribution": {
    score: 78,
    summary: "能够识别同期变量并提出分组分析，结论限制需要表达得更审慎。",
    strengths: ["归因变量识别完整"],
    issues: ["需要明确无法完全隔离时的结论边界"],
  },
  "interview-follow-up-motivation-criteria": {
    score: 81,
    summary: "判断标准兼顾成长与岗位实际，沟通和调整步骤比较清楚。",
    strengths: ["判断标准具体"],
    issues: ["可以补充明确的观察周期"],
  },
}

function createReferenceAnswer(questionId: string): InterviewReferenceAnswerResponse {
  const content = referenceAnswersByQuestionId[questionId]
  return content === undefined
    ? { status: "unavailable", reason: "generationFailed" }
    : { status: "ready", content: structuredClone(content) }
}

function createFollowUpPerformance(followUpQuestionId: string): InterviewFollowUpReviewResponse {
  const template = followUpReviewsById[followUpQuestionId]
  if (template === undefined) {
    throw new Error(`Missing interview follow-up review fixture for ${followUpQuestionId}.`)
  }
  return {
    followUpQuestionId,
    ...structuredClone(template),
  }
}

function unique(items: readonly string[]) {
  return [...new Set(items)]
}

function getQuestionReviewTemplate(questionId: string) {
  const template = questionReviewsById[questionId]
  if (template === undefined) {
    throw new Error(`Missing interview review fixture for question ${questionId}.`)
  }
  return template
}

function createQuestionReviews(
  completedQuestions: readonly CompletedInterviewQuestionResponse[],
): InterviewQuestionReviewResponse[] {
  return completedQuestions.map(({ question }) => {
    const template = getQuestionReviewTemplate(question.id)
    return {
      questionId: question.id,
      score: template.score,
      summary: template.summary,
      strengths: structuredClone(template.strengths),
      issues: structuredClone(template.issues),
    }
  })
}

function createReviewNarrative(
  completedQuestions: readonly CompletedInterviewQuestionResponse[],
  mode: "partial" | "complete",
): InterviewPartialReviewResponse {
  const templates = completedQuestions.map(({ question }) => getQuestionReviewTemplate(question.id))
  return {
    overallPerformance:
      mode === "partial"
        ? `本次面试提前结束，以下结果仅基于已完成的 ${completedQuestions.length} 道正式问题，不能代表完整面试表现。`
        : `本次复盘基于已完成的 ${completedQuestions.length} 道正式问题，覆盖本场实际出现的问答内容。`,
    questionReviews: createQuestionReviews(completedQuestions),
    mainStrengths: unique(templates.flatMap(({ strengths }) => strengths)),
    frequentIssues: unique(templates.flatMap(({ issues }) => issues)),
    exposedWeaknesses: unique(templates.flatMap(({ weaknesses }) => weaknesses)),
    riskPoints: unique(templates.flatMap(({ risks }) => risks)),
    communicationSuggestions: unique(
      templates.flatMap(({ communicationSuggestions }) => communicationSuggestions),
    ),
    preparationSuggestions: unique(
      templates.flatMap(({ preparationSuggestions }) => preparationSuggestions),
    ),
    generatedAt: "2026-07-24T02:20:00.000Z",
  }
}

function createCompleteInterviewReview(
  completedQuestions: readonly CompletedInterviewQuestionResponse[],
): InterviewReviewResponse {
  const narrative = createReviewNarrative(completedQuestions, "complete")
  const averageScore = Math.round(
    narrative.questionReviews.reduce((total, { score }) => total + score, 0) /
      narrative.questionReviews.length,
  )
  const lowestQuestion = [...completedQuestions].sort(
    (left, right) =>
      getQuestionReviewTemplate(left.question.id).score -
      getQuestionReviewTemplate(right.question.id).score,
  )[0]!
  const lowestReview = getQuestionReviewTemplate(lowestQuestion.question.id)

  return {
    ...narrative,
    overallScore: averageScore,
    dimensionScores: [
      {
        dimension: "relevance",
        score: Math.min(100, averageScore + 3),
        explanation: "评分基于本场实际完成问题中的回答相关性。",
      },
      {
        dimension: "structure",
        score: Math.min(100, averageScore + 1),
        explanation: "评分基于本场实际完成回答的组织与表达结构。",
      },
      {
        dimension: "specificity",
        score: Math.max(0, averageScore - 3),
        explanation: "评分基于本场实际回答中事实、行动和结果的具体程度。",
      },
      {
        dimension: "personalContribution",
        score: Math.min(100, averageScore + 2),
        explanation: "评分基于本场实际回答对个人职责、判断和推动动作的呈现。",
      },
      {
        dimension: "resultsAndEvidence",
        score: Math.max(0, averageScore - 2),
        explanation: "评分基于本场实际回答对结果、指标和验证证据的说明。",
      },
      {
        dimension: "roleAlignment",
        score: Math.min(100, averageScore + 1),
        explanation: "评分基于本场实际问答体现的岗位理解与能力匹配程度。",
      },
      {
        dimension: "communication",
        score: averageScore,
        explanation: "评分基于本场正式问答中的整体沟通表现。",
      },
      {
        dimension: "riskControl",
        score: Math.max(0, averageScore - 1),
        explanation: "评分基于本场实际回答对约束、风险和应对措施的说明。",
      },
    ],
    nextTraining: {
      action: "targetedPractice",
      reason: `下一步建议围绕本场“${lowestQuestion.question.prompt}”中暴露的改进重点继续训练。`,
      focusAreas: structuredClone(lowestReview.issues),
      questionType: lowestQuestion.question.type,
      difficulty: "pressure",
    },
  }
}

export function createInterviewSessionReview(
  completedQuestions: readonly CompletedInterviewQuestionResponse[],
  completionReason: InterviewCompletionReason,
): InterviewSessionReviewResponse {
  if (completedQuestions.length === 0) {
    return { status: "unavailable", reason: "insufficientAnswers" }
  }
  if (completionReason === "userEndedEarly") {
    return {
      status: "partial",
      review: createReviewNarrative(completedQuestions, "partial"),
    }
  }
  return {
    status: "complete",
    review: createCompleteInterviewReview(completedQuestions),
  }
}

export function createInterviewQuestionDetails(
  records: readonly InterviewQuestionRecordResponse[],
  review: InterviewSessionReviewResponse,
): InterviewQuestionLearningDetailResponse[] {
  const questionReviews = review.status === "unavailable" ? [] : review.review.questionReviews

  return records.map((record) => ({
    record: structuredClone(record),
    performance:
      record.status === "answered"
        ? structuredClone(
            questionReviews.find(({ questionId }) => questionId === record.question.id) ?? null,
          )
        : null,
    referenceAnswer: createReferenceAnswer(record.question.id),
    followUps: record.followUps.map((followUp) => ({
      record: structuredClone(followUp),
      performance:
        followUp.status === "answered" ? createFollowUpPerformance(followUp.question.id) : null,
      referenceAnswer: createReferenceAnswer(followUp.question.id),
    })),
  }))
}

const answerByQuestionId: Record<string, string> = {
  "interview-question-self-introduction":
    "我过去五年主要负责复杂业务的前端架构和性能治理，最近两年主导了核心交易链路升级。",
  "interview-question-project-deep-dive":
    "我先通过真实用户监控定位长任务和资源瀑布，再分阶段实施拆包、预加载和渲染调度优化。",
  "interview-question-motivation":
    "这个岗位的业务复杂度和技术挑战与我的经验高度匹配，我希望进一步提升架构和团队影响力。",
  "interview-question-collaboration":
    "我先统一各团队对目标和约束的理解，再拆分责任边界并用阶段结果持续建立共识。",
  "interview-question-role-capability":
    "我会先补齐可观测性并完成风险分级，再按业务影响制定治理路线和协作机制。",
}

function createCompletedQuestionRecords(
  scenario: InterviewAgentMockScenario = "singleFollowUp",
): CompletedInterviewQuestionResponse[] {
  const plan = createInterviewAgentPlanMock(scenario)
  return plan.questions.map(({ followUps, question }, questionIndex) => ({
    question,
    answer: {
      id: `interview-answer-${questionIndex + 1}`,
      content: answerByQuestionId[question.id] ?? "我会结合实际约束说明判断、行动和结果。",
      submittedAt: `2026-07-24T02:${String(questionIndex * 4 + 2).padStart(2, "0")}:00.000Z`,
    },
    followUps: followUps.map((followUp, followUpIndex) => ({
      status: "answered",
      question: followUp,
      answer: {
        id: `interview-follow-up-answer-${questionIndex + 1}-${followUpIndex + 1}`,
        content: "我会补充灰度分组和同期对照，明确归因边界并持续观察核心转化变化。",
        submittedAt: `2026-07-24T02:${String(questionIndex * 4 + followUpIndex + 3).padStart(2, "0")}:00.000Z`,
      },
    })),
    completedAt: `2026-07-24T02:${String(questionIndex * 4 + followUps.length + 3).padStart(2, "0")}:00.000Z`,
  }))
}

export function createInterviewCompletedSessionMock(
  options: {
    agentScenario?: InterviewAgentMockScenario
    completionReason?: InterviewCompletionReason
    completedMainQuestions?: number
  } = {},
): InterviewCompletedSessionResponse {
  const agentScenario = options.agentScenario ?? "singleFollowUp"
  const completionReason = options.completionReason ?? "formalQuestionsCompleted"
  const plan = createInterviewAgentPlanMock(agentScenario)
  const completedQuestions = createCompletedQuestionRecords(agentScenario).slice(
    0,
    options.completedMainQuestions,
  )
  const questionRecords: InterviewQuestionRecordResponse[] = completedQuestions.map(
    ({ answer, followUps, question }) => ({
      status: "answered",
      question: structuredClone(question),
      answer: structuredClone(answer),
      followUps: structuredClone(followUps),
    }),
  )
  const review = createInterviewSessionReview(completedQuestions, completionReason)
  return {
    status: "completed",
    sessionId: "mock-interview-session-completed",
    version: 10,
    configuration: {
      targetRoleId: "role_frontend_bytedance",
      round: "technical",
      difficulty: "pressure",
      durationMinutes: 30,
    },
    startedAt: "2026-07-24T02:00:00.000Z",
    progress: {
      completedMainQuestions: completedQuestions.length,
      totalMainQuestions: plan.initialProgress.totalMainQuestions,
      planRevision: plan.initialProgress.planRevision,
    },
    completedQuestions,
    completionReason,
    completedAt: "2026-07-24T02:18:00.000Z",
    candidateQuestionExchanges:
      completionReason === "formalQuestionsCompleted"
        ? [createCandidateQuestionExchange("这个岗位入职后的核心目标和主要协作团队分别是什么？", 1)]
        : [],
    review,
    questionDetails: createInterviewQuestionDetails(questionRecords, review),
  }
}

export function createInterviewReviewResponseMock(
  session: InterviewCompletedSessionResponse = createInterviewCompletedSessionMock(),
): GetInterviewReviewResponse {
  const base = {
    sessionId: session.sessionId,
    completionReason: session.completionReason,
    questionDetails: structuredClone(session.questionDetails),
  }
  if (session.review.status === "unavailable") {
    return { ...base, ...session.review }
  }
  if (session.review.status === "partial") {
    const review = session.review.review
    return {
      ...base,
      status: "partial",
      review,
    }
  }
  const review = session.review.review
  return {
    ...base,
    status: "complete",
    review,
  }
}

export function createInterviewMockResponse(
  scenario: InterviewMockScenario = "setupReady",
): InterviewPageResponse {
  if (scenario === "noTargetRoles") {
    return {
      setup: createInterviewSetupResponseMock(
        createRolesMockResponse("noRoles"),
        profileResponseMock,
      ),
      session: null,
    }
  }

  if (scenario === "completed") {
    return {
      setup: structuredClone(interviewSetupResponseMock),
      session: createInterviewCompletedSessionMock(),
    }
  }

  if (scenario === "prerequisiteNotMet") {
    return {
      setup: createInterviewSetupResponseMock(
        createRolesMockResponse("multipleRoles"),
        createProfileMockSnapshot("partial"),
      ),
      session: null,
    }
  }

  return {
    setup: structuredClone(interviewSetupResponseMock),
    session: null,
  }
}
