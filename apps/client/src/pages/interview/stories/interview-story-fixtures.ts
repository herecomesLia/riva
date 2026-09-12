import { interviewFixture } from "@/mocks/fixtures/interview"
import type {
  CandidateQuestionExchange,
  CompleteInterviewReview,
  InterviewConversationItem,
  InterviewData,
  InterviewSetup,
  PartialInterviewReview,
  InterviewReview,
} from "@/models/interview-workflow"
import type { InterviewSessionSummary } from "../InterviewSessionView"

export function createInterviewSetupStoryFixture(
  scenario:
    | "setupReady"
    | "prerequisiteNotMet"
    | "multipleRolesReady"
    | "jobDescriptionMissing" = "setupReady",
): InterviewSetup {
  const setup: InterviewSetup = {
    availability: { status: "available" },
    roles: [
      {
        id: "role_frontend_bytedance",
        title: "Senior Frontend Engineer",
        company: "ByteDance",
        supportedRounds: ["hr", "firstBusiness", "technical", "manager", "final", "comprehensive"],
      },
    ],
    availableDifficulties: ["basic", "pressure"],
    availableDurationMinutes: [15, 30, 45],
    defaultConfiguration: {
      ...interviewFixture.configuration,
      roleId: "role_frontend_bytedance",
    },
  }
  if (scenario === "multipleRolesReady")
    setup.roles.push({
      id: "role_product_manager_meituan",
      title: "Product Manager",
      company: "Meituan",
      supportedRounds: ["hr", "firstBusiness", "manager", "final", "comprehensive"],
    })
  if (scenario === "prerequisiteNotMet")
    setup.availability = { status: "blocked", reason: "profileIncomplete" }
  if (scenario === "jobDescriptionMissing") {
    setup.availability = { status: "blocked", reason: "jobDescriptionMissing" }
    setup.roles = []
    setup.defaultConfiguration.roleId = null
  }
  return setup
}

export function createInterviewPageStoryFixture(
  scenario: "setupReady" | "prerequisiteNotMet" | "noRoles" | "completed" = "setupReady",
): InterviewData {
  const setup = createInterviewSetupStoryFixture(
    scenario === "prerequisiteNotMet" ? scenario : "setupReady",
  )
  if (scenario === "noRoles") {
    setup.roles = []
    setup.defaultConfiguration.roleId = null
  }
  return {
    setup,
    session:
      scenario === "completed"
        ? {
            status: "completed",
            sessionId: interviewFixture.sessionId,
            history: createInterviewSessionStoryFixture().history,
          }
        : null,
  }
}

export function createCandidateExchangeStoryFixture(
  question = "这个岗位入职后的成功标准是什么？",
): CandidateQuestionExchange {
  return {
    question,
    interviewerAnswer: interviewFixture.candidate.interviewerAnswer,
    feedback: structuredClone(interviewFixture.candidate.feedback),
  }
}

export function createInterviewSessionStoryFixture() {
  const history: InterviewConversationItem[] = [
    {
      kind: "question",
      questionOrder: 1,
      prompt: interviewFixture.question.content,
      answer: "我先明确目标，再推动小范围验证并复盘结果。",
    },
    {
      kind: "followUp",
      questionOrder: 1,
      prompt: interviewFixture.followUp.content,
      answer: "我通过实验组和对照组排查同期变化的影响。",
    },
  ]
  const summary: InterviewSessionSummary = {
    role: "Senior Frontend Engineer",
    company: "ByteDance",
    round: interviewFixture.configuration.round,
    difficulty: interviewFixture.configuration.difficulty,
    ...interviewFixture.progress,
    completedMainQuestions: 1,
  }
  return {
    candidateExchange: createCandidateExchangeStoryFixture(),
    candidatePrompt: interviewFixture.candidate.prompt,
    history,
    openingMessage: interviewFixture.openingMessage,
    summary,
  }
}

// Two questions and all labels exercise review layout, without an Agent plan.
export function createInterviewReviewStoryFixture(): CompleteInterviewReview {
  const response: CompleteInterviewReview = structuredClone(interviewFixture.review)
  response.questionDetails[0]!.answer = "我明确了目标与约束。"
  response.questionDetails[0]!.followUps = []
  response.questionDetails.push({
    ...structuredClone(interviewFixture.review.questionDetails[0]!),
    questionOrder: 2,
    prompt: "请进一步说明关键方案的取舍和验证过程。",
    answer: "我通过灰度实验比较方案，再分阶段推进。",
  })
  response.questionDetails[1]!.followUps[0]!.answer = "我比较了同期对照数据。"
  response.review.dimensionScores = (
    [
      "relevance",
      "structure",
      "specificity",
      "personalContribution",
      "resultsAndEvidence",
      "roleAlignment",
      "communication",
      "riskControl",
    ] as const
  ).map((dimension) => ({ ...interviewFixture.review.review.dimensionScores[0]!, dimension }))
  return response
}

export function createSparseInterviewReviewStoryFixture(): CompleteInterviewReview {
  return structuredClone(interviewFixture.review)
}

export function createUnavailableInterviewReviewStoryFixture(): Extract<
  InterviewReview,
  { status: "unavailable" }
> {
  return { status: "unavailable", questionDetails: [] }
}

export function createPartialInterviewReviewStoryFixture(): PartialInterviewReview {
  return {
    status: "partial",
    review: structuredClone(interviewFixture.review.review),
    questionDetails: createInterviewReviewStoryFixture().questionDetails.slice(0, 1),
  }
}

export function createUnavailableReviewWithLearningStoryFixture(): Extract<
  InterviewReview,
  { status: "unavailable" }
> {
  const detail = structuredClone(interviewFixture.review.questionDetails[0]!)
  return {
    status: "unavailable",
    questionDetails: [{ ...detail, answer: null, performance: null, followUps: [] }],
  }
}

export function createPartialWithUnansweredQuestionStoryFixture(): PartialInterviewReview {
  const response = createPartialInterviewReviewStoryFixture()
  const detail = createInterviewReviewStoryFixture().questionDetails[1]!
  response.questionDetails.push({ ...detail, answer: null, performance: null, followUps: [] })
  return response
}

export function createPartialWithUnansweredFollowUpStoryFixture(): PartialInterviewReview {
  const complete = createInterviewReviewStoryFixture()
  const followUp = complete.questionDetails[1]!.followUps[0]!
  followUp.answer = null
  followUp.performance = null
  return { status: "partial", review: complete.review, questionDetails: complete.questionDetails }
}

export function createMultipleFollowUpsReviewStoryFixture(): CompleteInterviewReview {
  const response = createInterviewReviewStoryFixture()
  const followUps = response.questionDetails[1]!.followUps
  followUps.push({
    ...structuredClone(followUps[0]!),
    prompt: "如果结果不符合预期，你会如何调整？",
  })
  return response
}

export function createGeneratingReferenceReviewStoryFixture(): CompleteInterviewReview {
  const response = createInterviewReviewStoryFixture()
  response.questionDetails[0]!.referenceAnswer = { status: "generating" }
  return response
}

export function createLongCandidateExchangesStoryFixture(): CandidateQuestionExchange[] {
  return [
    "这个岗位在入职前三个月最重要的业务目标、衡量标准以及与上下游团队的协作边界分别是什么？",
    "如果核心项目同时受到资源不足、跨团队优先级冲突和历史系统约束，团队通常如何做取舍并确保决策透明？",
    "团队如何定义优秀成员的成长路径，又会通过哪些具体反馈机制帮助成员持续提升专业判断和影响力？",
  ].map((question) => ({
    ...createCandidateExchangeStoryFixture(question),
    interviewerAnswer: interviewFixture.candidate.interviewerAnswer.repeat(2),
  }))
}
