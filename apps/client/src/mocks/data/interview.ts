import type {
  CompletedInterviewQuestionResponse,
  GetInterviewReviewResponse,
  InterviewCandidateQuestionExchangeResponse,
  InterviewCompletionReason,
  InterviewCompletedSessionResponse,
  InterviewFollowUpReviewResponse,
  InterviewConfiguration,
  InterviewPageResponse,
  InterviewQuestionLearningDetailResponse,
  InterviewQuestionRecordResponse,
  InterviewQuestionReviewResponse,
  InterviewPartialReviewResponse,
  InterviewReferenceAnswerResponse,
  InterviewReviewResponse,
  InterviewSessionReviewResponse,
  InterviewSetupResponse,
} from "@/models/interview"
import type { JobProfileSnapshot } from "@/models/profile"
import type { RolesPageResponse } from "@/models/roles"

import { createProfileMockSnapshot, profileResponseMock } from "./profile"
import { createRolesMockResponse } from "./roles"
import {
  createInterviewAgentPlanMock,
  getInterviewFollowUpReferenceAnswer,
  getInterviewFollowUpReviewTemplate,
  getInterviewMockAnswer,
  getInterviewQuestionReferenceAnswer,
  getInterviewQuestionReviewTemplate,
  supportedInterviewRoundsByTargetRoleId,
  type InterviewAgentMockScenario,
} from "./interview-catalog"

export {
  createInterviewAgentPlanMock,
  type InterviewAgentMockScenario,
  type MockInterviewAgentPlan,
} from "./interview-catalog"

export type InterviewMockScenario =
  "setupReady" | "noTargetRoles" | "prerequisiteNotMet" | "completed"

export const interviewSetupConfigurationMock = {
  availableDifficulties: ["basic", "pressure"],
  availableDurationMinutes: [15, 30, 45],
  defaultRound: "technical",
  defaultDifficulty: "pressure",
  defaultDurationMinutes: 30,
  supportedRoundsByTargetRoleId: supportedInterviewRoundsByTargetRoleId,
} as const

export function createInterviewSetupResponseMock(
  rolesResponse: RolesPageResponse,
  profileSnapshot: JobProfileSnapshot,
): InterviewSetupResponse {
  const activeRoles = rolesResponse.roles.filter(
    ({ id, preparationStatus }) =>
      preparationStatus !== "archived" &&
      id in interviewSetupConfigurationMock.supportedRoundsByTargetRoleId,
  )
  const currentRole = activeRoles.find(({ id }) => id === rolesResponse.currentRoleId)
  const targetRoles = activeRoles.map(({ company, id, title }) => ({
    id,
    title,
    company,
    supportedRounds: [
      ...interviewSetupConfigurationMock.supportedRoundsByTargetRoleId[
        id as keyof typeof interviewSetupConfigurationMock.supportedRoundsByTargetRoleId
      ],
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

function createReferenceAnswer(questionId: string): InterviewReferenceAnswerResponse {
  const content =
    getInterviewQuestionReferenceAnswer(questionId) ??
    getInterviewFollowUpReferenceAnswer(questionId)
  return content === undefined
    ? { status: "unavailable", reason: "generationFailed" }
    : { status: "ready", content: structuredClone(content) }
}

function createFollowUpPerformance(followUpQuestionId: string): InterviewFollowUpReviewResponse {
  const template = getInterviewFollowUpReviewTemplate(followUpQuestionId)
  return {
    followUpQuestionId,
    ...structuredClone(template),
  }
}

function unique(items: readonly string[]) {
  return [...new Set(items)]
}

function getQuestionReviewTemplate(questionId: string) {
  return getInterviewQuestionReviewTemplate(questionId)
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

export const defaultInterviewConfigurationMock: InterviewConfiguration = {
  targetRoleId: "role_frontend_bytedance",
  round: "technical",
  difficulty: "pressure",
  durationMinutes: 30,
}

function createCompletedQuestionRecords(
  configuration: InterviewConfiguration,
  scenario: InterviewAgentMockScenario = "singleFollowUp",
): CompletedInterviewQuestionResponse[] {
  const plan = createInterviewAgentPlanMock({ ...configuration, scenario })
  return plan.questions.map(({ followUps, question }, questionIndex) => ({
    question,
    answer: {
      id: `interview-answer-${questionIndex + 1}`,
      content: getInterviewMockAnswer(question.id),
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
    configuration?: InterviewConfiguration
  } = {},
): InterviewCompletedSessionResponse {
  const agentScenario = options.agentScenario ?? "singleFollowUp"
  const completionReason = options.completionReason ?? "formalQuestionsCompleted"
  const configuration = options.configuration ?? defaultInterviewConfigurationMock
  const plan = createInterviewAgentPlanMock({ ...configuration, scenario: agentScenario })
  const completedQuestions = createCompletedQuestionRecords(configuration, agentScenario).slice(
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
    configuration: structuredClone(configuration),
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
