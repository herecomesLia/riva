import {
  candidateQuestionsPromptMock,
  createCandidateQuestionExchange,
  createInterviewCompletedSessionMock,
  createInterviewMockResponse,
  createInterviewReviewResponseMock,
  createInterviewSetupResponseMock,
  interviewOpeningMessageMock,
} from "@/mocks/data/interview"
import { createProfileMockSnapshot } from "@/mocks/data/profile"
import { createRolesMockResponse } from "@/mocks/data/roles"
import type {
  GetInterviewReviewResponse,
  InterviewCandidateQuestionExchangeResponse,
  InterviewConversationRecordViewData,
  InterviewQuestionResponse,
  InterviewSetupResponse,
} from "@/models/interview"
import type { InteractionLanguage } from "@/types/language"

import type { InterviewSessionSummary } from "../InterviewSessionView"

export function createInterviewSetupStoryFixture(
  scenario:
    | "setupReady"
    | "prerequisiteNotMet"
    | "multipleRolesReady"
    | "jobDescriptionMissing" = "setupReady",
): InterviewSetupResponse {
  if (scenario === "multipleRolesReady") {
    return createInterviewSetupResponseMock(
      createRolesMockResponse("multipleRolesReady"),
      createProfileMockSnapshot(),
    )
  }
  if (scenario === "jobDescriptionMissing") {
    return createInterviewSetupResponseMock(
      createRolesMockResponse("multipleRolesJdMissing"),
      createProfileMockSnapshot(),
    )
  }
  return structuredClone(createInterviewMockResponse(scenario).setup)
}

export function createInterviewSessionStoryFixture(language: InteractionLanguage = "zh-CN") {
  const response = {
    ...createInterviewMockResponse("completed"),
    session: createInterviewCompletedSessionMock({ language }),
  }
  const session = response.session
  if (session?.status !== "completed") {
    throw new Error("Completed interview fixture required.")
  }
  const targetRole = response.setup.targetRoles.find(
    ({ id }) => id === session.configuration.targetRoleId,
  )
  if (targetRole === undefined) {
    throw new Error("Completed interview target role fixture required.")
  }
  const candidateExchange = session.candidateQuestionExchanges[0]
  if (candidateExchange === undefined) {
    throw new Error("Candidate question exchange fixture required.")
  }

  const history: InterviewConversationRecordViewData[] = session.completedQuestions.flatMap(
    ({ answer, followUps, question }) => [
      {
        id: question.id,
        kind: "question" as const,
        questionOrder: question.order,
        prompt: question.prompt,
        answer: answer.content,
      },
      ...followUps.map(({ answer: followUpAnswer, question: followUp }) => ({
        id: followUp.id,
        kind: "followUp" as const,
        questionOrder: question.order,
        prompt: followUp.prompt,
        answer: followUpAnswer.content,
      })),
    ],
  )
  const summary: InterviewSessionSummary = {
    targetRole: targetRole.title,
    company: targetRole.company,
    round: session.configuration.round,
    difficulty: session.configuration.difficulty,
    completedMainQuestions: session.progress.completedMainQuestions,
    totalMainQuestions: session.progress.totalMainQuestions,
    planRevision: session.progress.planRevision,
  }

  return {
    language: session.language,
    candidateExchange: structuredClone(candidateExchange),
    candidatePrompt: candidateQuestionsPromptMock,
    completedQuestions: structuredClone(session.completedQuestions),
    history,
    openingMessage: interviewOpeningMessageMock,
    summary,
  }
}

export function createEnglishInterviewSessionStoryFixture() {
  const fixture = createInterviewSessionStoryFixture("en")
  const englishPrompts: Record<string, string> = {
    [fixture.completedQuestions[0]?.question.id ?? ""]:
      "Please introduce your experience and explain how it aligns with this role.",
    [fixture.completedQuestions[1]?.question.id ?? ""]:
      "Describe a complex technical project you led and how you measured its result.",
  }

  const completedQuestions = fixture.completedQuestions.map((completedQuestion) => ({
    ...completedQuestion,
    question: {
      ...completedQuestion.question,
      prompt: englishPrompts[completedQuestion.question.id] ?? completedQuestion.question.prompt,
    },
    followUps: completedQuestion.followUps.map((followUp) => ({
      ...followUp,
      question: {
        ...followUp.question,
        prompt: "What evidence would you use to validate that result?",
      },
    })),
  })) satisfies Array<{
    question: InterviewQuestionResponse
  }>

  return {
    ...fixture,
    completedQuestions,
    openingMessage:
      "Welcome to this mock interview. I will ask a series of questions about your experience, project capabilities, and motivation. Please answer as you would in a formal interview.",
    candidatePrompt:
      "The formal questions are complete. You can now ask the interviewer questions.",
    candidateExchange: {
      ...fixture.candidateExchange,
      interviewerAnswer:
        "This role works closely with the recommendations, search, and commerce teams. The initial focus is learning the core flows and gradually taking ownership of cross-team technical projects.",
      feedback: {
        summary:
          "The question focuses on collaboration and onboarding goals, which helps clarify the practical scope of the role.",
        strengths: ["Focuses on real responsibilities", "Shows interest in long-term contribution"],
        improvementSuggestions: [
          "You could also ask about the concrete success criteria for the first six months.",
        ],
        suggestedAlternatives: [
          "What outcomes does the team use to evaluate success after six months in this role?",
        ],
      },
    },
    history: fixture.history.map((record, index) => ({
      ...record,
      prompt:
        index === 0
          ? "Please introduce your experience and explain how it aligns with this role."
          : "Describe a complex technical project you led and how you measured its result.",
    })),
  }
}

export function createSparseInterviewReviewStoryFixture(): GetInterviewReviewResponse {
  const response = createInterviewReviewResponseMock()
  if (response.status !== "complete") {
    throw new Error("Complete interview review fixture required.")
  }
  return {
    ...response,
    questionDetails: response.questionDetails.slice(0, 1),
    review: {
      ...response.review,
      dimensionScores: response.review.dimensionScores.slice(0, 2),
      questionReviews: response.review.questionReviews.slice(0, 1),
      mainStrengths: response.review.mainStrengths.slice(0, 1),
      frequentIssues: response.review.frequentIssues.slice(0, 1),
      exposedWeaknesses: response.review.exposedWeaknesses.slice(0, 1),
      riskPoints: response.review.riskPoints.slice(0, 1),
      communicationSuggestions: response.review.communicationSuggestions.slice(0, 1),
      preparationSuggestions: response.review.preparationSuggestions.slice(0, 1),
      nextTraining: {
        ...response.review.nextTraining,
        focusAreas: response.review.nextTraining.focusAreas.slice(0, 1),
      },
    },
  }
}

export function createUnavailableInterviewReviewStoryFixture() {
  return createInterviewReviewResponseMock(
    createInterviewCompletedSessionMock({
      completionReason: "userEndedEarly",
      completedMainQuestions: 0,
    }),
  )
}

export function createPartialInterviewReviewStoryFixture() {
  return createInterviewReviewResponseMock(
    createInterviewCompletedSessionMock({
      completionReason: "userEndedEarly",
      completedMainQuestions: 1,
    }),
  )
}

export function createUnavailableReviewWithLearningStoryFixture(): GetInterviewReviewResponse {
  const complete = createInterviewReviewResponseMock(
    createInterviewCompletedSessionMock({ agentScenario: "noFollowUps" }),
  )
  if (complete.status !== "complete") throw new Error("Complete review fixture required.")
  const detail = structuredClone(complete.questionDetails[0]!)
  detail.record = {
    status: "unanswered",
    question: detail.record.question,
    answer: null,
    followUps: [],
  }
  detail.performance = null
  detail.followUps = []
  return {
    status: "unavailable",
    reason: "insufficientAnswers",
    sessionId: complete.sessionId,
    completionReason: "userEndedEarly",
    questionDetails: [detail],
  }
}

export function createPartialWithUnansweredQuestionStoryFixture(): GetInterviewReviewResponse {
  const partial = createPartialInterviewReviewStoryFixture()
  const complete = createInterviewReviewResponseMock(
    createInterviewCompletedSessionMock({ agentScenario: "noFollowUps" }),
  )
  if (partial.status !== "partial" || complete.status !== "complete") {
    throw new Error("Partial and complete review fixtures required.")
  }
  const unanswered = structuredClone(complete.questionDetails[1]!)
  unanswered.record = {
    status: "unanswered",
    question: unanswered.record.question,
    answer: null,
    followUps: [],
  }
  unanswered.performance = null
  unanswered.followUps = []
  return {
    ...partial,
    questionDetails: [...partial.questionDetails, unanswered],
  }
}

export function createPartialWithUnansweredFollowUpStoryFixture(): GetInterviewReviewResponse {
  const response = createInterviewReviewResponseMock(
    createInterviewCompletedSessionMock({
      agentScenario: "singleFollowUp",
      completionReason: "userEndedEarly",
      completedMainQuestions: 2,
    }),
  )
  if (response.status !== "partial") throw new Error("Partial review fixture required.")
  const copy = structuredClone(response)
  const followUp = copy.questionDetails[1]?.followUps[0]
  if (followUp === undefined) throw new Error("Follow-up fixture required.")
  followUp.record = {
    status: "unanswered",
    question: followUp.record.question,
    answer: null,
  }
  followUp.performance = null
  return copy
}

export function createMultipleFollowUpsReviewStoryFixture(): GetInterviewReviewResponse {
  return createInterviewReviewResponseMock(
    createInterviewCompletedSessionMock({ agentScenario: "multipleFollowUps" }),
  )
}

export function createGeneratingReferenceReviewStoryFixture(): GetInterviewReviewResponse {
  const response = createInterviewReviewResponseMock()
  if (response.status !== "complete") throw new Error("Complete review fixture required.")
  const copy = structuredClone(response)
  copy.questionDetails[0]!.referenceAnswer = { status: "generating" }
  return copy
}

export function createLongCandidateExchangesStoryFixture(): InterviewCandidateQuestionExchangeResponse[] {
  return [
    createCandidateQuestionExchange(
      "这个岗位在入职前三个月最重要的业务目标、衡量标准以及与上下游团队的协作边界分别是什么？",
      1,
    ),
    createCandidateQuestionExchange(
      "如果核心项目同时受到资源不足、跨团队优先级冲突和历史系统约束，团队通常如何做取舍并确保决策透明？",
      2,
    ),
    createCandidateQuestionExchange(
      "团队如何定义优秀成员的成长路径，又会通过哪些具体反馈机制帮助成员持续提升专业判断和影响力？",
      3,
    ),
  ].map((exchange) => ({
    ...exchange,
    interviewerAnswer: `${exchange.interviewerAnswer}${exchange.interviewerAnswer}`,
  }))
}
