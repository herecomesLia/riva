import type {
  CompletedInterviewQuestionResponse,
  GetInterviewReviewResponse,
  InterviewCandidateQuestionExchangeResponse,
  InterviewCompletionReason,
  InterviewCompletedSessionResponse,
  InterviewConfiguration,
  InterviewPageResponse,
  InterviewProgressResponse,
  InterviewQuestionLearningDetailResponse,
  InterviewQuestionRecordResponse,
  InterviewSessionReviewResponse,
} from "@/models/interview"

import { createProfileMockSnapshot, profileResponseMock } from "../profile"
import { createRolesMockResponse } from "../roles"
import { createInterviewAgentPlanMock, type InterviewAgentMockScenario } from "./agent-plans"
import { getInterviewMockAnswer } from "./question-catalog"
import { createInterviewQuestionDetails, createInterviewSessionReview } from "./review-builders"
import {
  createCandidateQuestionExchange,
  createInterviewSetupResponseMock,
  interviewSetupResponseMock,
} from "./setup-fixtures"

export type InterviewMockScenario =
  "setupReady" | "noTargetRoles" | "prerequisiteNotMet" | "completed"

export const defaultInterviewConfigurationMock: InterviewConfiguration = {
  targetRoleId: "role_frontend_bytedance",
  round: "technical",
  difficulty: "pressure",
  durationMinutes: 30,
}

/** Full persisted Mock artifact. It deliberately stays outside the server response models. */
export type MockInterviewCompletedSession = {
  status: "completed"
  sessionId: string
  version: number
  configuration: InterviewConfiguration
  startedAt: string
  progress: InterviewProgressResponse
  completedQuestions: CompletedInterviewQuestionResponse[]
  completionReason: InterviewCompletionReason
  completedAt: string
  candidateQuestionExchanges: InterviewCandidateQuestionExchangeResponse[]
  review: InterviewSessionReviewResponse
  questionDetails: InterviewQuestionLearningDetailResponse[]
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
): MockInterviewCompletedSession {
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

export function createInterviewCompletedSessionResponseMock(
  session: MockInterviewCompletedSession = createInterviewCompletedSessionMock(),
): InterviewCompletedSessionResponse {
  return {
    status: "completed",
    sessionId: session.sessionId,
    version: session.version,
    completionReason: session.completionReason,
    completedAt: session.completedAt,
    reviewStatus: session.review.status,
  }
}

export function createInterviewReviewResponseMock(
  session: MockInterviewCompletedSession = createInterviewCompletedSessionMock(),
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
    return {
      ...base,
      status: "partial",
      review: session.review.review,
    }
  }
  return {
    ...base,
    status: "complete",
    review: session.review.review,
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
    const completedSession = createInterviewCompletedSessionMock()
    return {
      setup: structuredClone(interviewSetupResponseMock),
      session: createInterviewCompletedSessionResponseMock(completedSession),
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
