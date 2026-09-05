import type {
  InterviewCandidateQuestionExchangeResponse,
  InterviewQuestionLearningDetailResponse,
  InterviewReferenceAnswerResponse,
  InterviewSetupResponse,
} from "@/models/interview"
import type { MockInterviewCompletedSession } from "@/mocks/data/interview"
import type {
  MockInterviewOverallReviewState,
  MockInterviewRecordDetailResponse,
  TrainingRecordEvaluation,
  TrainingRecordQuestion,
  TrainingRecordRecommendation,
  TrainingRecordReferenceAnswer,
  TrainingRecordReview,
} from "@/models/training-records"

type CompletedInterviewPage = {
  setup: InterviewSetupResponse
  session: MockInterviewCompletedSession
}

function durationSeconds(startedAt: string, endedAt: string): number {
  return Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000))
}

function interviewReferenceAnswer(
  state: InterviewReferenceAnswerResponse,
): TrainingRecordReferenceAnswer {
  if (state.status === "ready") {
    return { status: "ready", content: structuredClone(state.content) }
  }
  if (state.status === "generating") return { status: "generating", content: null }
  return { status: "unavailable", content: null, reason: "generationFailed" }
}

function interviewEvaluation(score: number, evaluatedAt: string): TrainingRecordEvaluation {
  return { overallScore: score, dimensions: [], evaluatedAt }
}

function interviewQuestionReview(
  detail: InterviewQuestionLearningDetailResponse,
  suggestions: readonly string[],
): TrainingRecordReview | null {
  if (detail.performance === null) return null
  return {
    summary: detail.performance.summary,
    strengths: structuredClone(detail.performance.strengths),
    issues: structuredClone(detail.performance.issues),
    improvementSuggestions: [...suggestions],
    reusableAnswerStructure: [],
  }
}

function interviewQuestion(
  detail: InterviewQuestionLearningDetailResponse,
  evaluatedAt: string,
  suggestions: readonly string[],
): TrainingRecordQuestion {
  const { record } = detail
  return {
    id: record.question.id,
    prompt: record.question.prompt,
    type: record.question.type,
    order: record.question.order,
    attemptNumber: 1,
    retryOfQuestionId: null,
    assessedCapabilities: structuredClone(record.question.assessedCapabilities),
    isSaved: false,
    isMarkedWeak: false,
    answer:
      record.answer === null
        ? null
        : {
            id: record.answer.id,
            content: record.answer.content,
            submittedAt: record.answer.submittedAt,
          },
    evaluation:
      detail.performance === null
        ? null
        : interviewEvaluation(detail.performance.score, evaluatedAt),
    review: interviewQuestionReview(detail, suggestions),
    referenceAnswer: interviewReferenceAnswer(detail.referenceAnswer),
    followUps: detail.followUps.map(({ performance, record: followUp, referenceAnswer }) => ({
      id: followUp.question.id,
      prompt: followUp.question.prompt,
      order: followUp.question.order,
      askedAt: followUp.question.createdAt,
      answer:
        followUp.answer === null
          ? null
          : {
              id: followUp.answer.id,
              content: followUp.answer.content,
              submittedAt: followUp.answer.submittedAt,
            },
      evaluation: performance === null ? null : interviewEvaluation(performance.score, evaluatedAt),
      review:
        performance === null
          ? null
          : {
              summary: performance.summary,
              strengths: structuredClone(performance.strengths),
              issues: structuredClone(performance.issues),
              improvementSuggestions: [...suggestions],
              reusableAnswerStructure: [],
            },
      referenceAnswer: interviewReferenceAnswer(referenceAnswer),
    })),
  }
}

function interviewOverallReview(
  session: MockInterviewCompletedSession,
): MockInterviewOverallReviewState {
  if (session.review.status === "unavailable") {
    return { status: "unavailable", content: null, reason: "insufficientAnswers" }
  }
  const review = session.review.review
  return {
    status: session.review.status,
    content: {
      summary: review.overallPerformance,
      mainStrengths: structuredClone(review.mainStrengths),
      frequentIssues: structuredClone(review.frequentIssues),
      riskPoints: structuredClone(review.riskPoints),
      communicationSuggestions: structuredClone(review.communicationSuggestions),
      preparationSuggestions: structuredClone(review.preparationSuggestions),
      generatedAt: review.generatedAt,
    },
  }
}

function interviewRecommendation(
  session: MockInterviewCompletedSession,
): TrainingRecordRecommendation {
  if (session.review.status === "complete") {
    return structuredClone(session.review.review.nextTraining)
  }
  if (session.review.status === "partial") {
    const firstAnswered = session.questionDetails.find(
      (detail) => detail.record.status === "answered",
    )
    return firstAnswered === undefined
      ? { action: "none", reason: session.review.review.overallPerformance }
      : {
          action: "targetedPractice",
          reason:
            session.review.review.preparationSuggestions[0] ??
            session.review.review.overallPerformance,
          questionType: firstAnswered.record.question.type,
          difficulty: session.configuration.difficulty,
          focusAreas: structuredClone(firstAnswered.performance?.issues ?? []),
        }
  }
  return {
    action: "mockInterview",
    reason: "有效回答不足，建议重新完成一轮模拟面试。",
    round: session.configuration.round,
    difficulty: session.configuration.difficulty,
    focusAreas: [],
  }
}

function candidateQuestionExchange(
  exchange: InterviewCandidateQuestionExchangeResponse,
): MockInterviewRecordDetailResponse["candidateQuestionExchanges"][number] {
  return {
    id: exchange.question.id,
    question: exchange.question.content,
    interviewerAnswer: exchange.interviewerAnswer,
    feedback: [
      exchange.feedback.summary,
      ...exchange.feedback.strengths,
      ...exchange.feedback.improvementSuggestions,
      ...exchange.feedback.suggestedAlternatives,
    ].join("\n"),
    submittedAt: exchange.question.submittedAt,
  }
}

export function createMockInterviewRecordSnapshot(
  page: CompletedInterviewPage,
): MockInterviewRecordDetailResponse {
  const { session } = page
  const targetRole = page.setup.targetRoles.find(
    (candidate) => candidate.id === session.configuration.targetRoleId,
  )
  if (targetRole === undefined) {
    throw new Error("Cannot create a training record without the target role snapshot.")
  }
  const review = session.review.status === "unavailable" ? null : session.review.review
  const evaluatedAt = review?.generatedAt ?? session.completedAt
  const suggestions =
    review === null ? [] : [...review.communicationSuggestions, ...review.preparationSuggestions]
  const questions = session.questionDetails.map((detail) =>
    interviewQuestion(detail, evaluatedAt, suggestions),
  )
  const answeredQuestionCount = questions.filter((question) => question.answer !== null).length

  return {
    id: `mock-interview-record-${session.sessionId}`,
    kind: "mockInterview",
    status:
      session.completionReason === "formalQuestionsCompleted"
        ? "completed"
        : answeredQuestionCount === 0
          ? "endedEarly"
          : "partiallyCompleted",
    completionReason: session.completionReason,
    startedAt: session.startedAt,
    endedAt: session.completedAt,
    durationSeconds: durationSeconds(session.startedAt, session.completedAt),
    targetRole: {
      id: targetRole.id,
      title: targetRole.title,
      company: targetRole.company,
    },
    answeredQuestionCount,
    totalQuestionCount: questions.length,
    overallScore: session.review.status === "complete" ? session.review.review.overallScore : null,
    setup: {
      round: session.configuration.round,
      difficulty: session.configuration.difficulty,
      plannedDurationMinutes: session.configuration.durationMinutes,
    },
    questions,
    exposedWeaknesses: review === null ? [] : structuredClone(review.exposedWeaknesses),
    recommendation: interviewRecommendation(session),
    overallReview: interviewOverallReview(session),
    candidateQuestionExchanges: session.candidateQuestionExchanges.map(candidateQuestionExchange),
  }
}
