import type {
  MockInterviewRecordDetailResponse,
  MockInterviewRecordSummary,
  TargetedPracticeRecordSummary,
  TargetedPracticeRecordDetailResponse,
  TargetedPracticeQuestion,
  TrainingRecordAnswer,
  TrainingRecordEvaluation,
  TrainingRecordRecommendation,
  TrainingRecordReview,
  TrainingRecordQuestion,
  TrainingRecordsOverviewResponse,
  TrainingRecordsPageResponse,
} from "@/models/training-records"
import type {
  TargetedPracticeTrainingRecordAttemptWire,
  TargetedPracticeTrainingRecordDetailWire,
  TargetedPracticeTrainingRecordEvaluationWire,
  TargetedPracticeTrainingRecordFollowUpWire,
  TargetedPracticeTrainingRecordReviewWire,
  MockInterviewTrainingRecordDetailWire,
  MockInterviewTrainingRecordSummaryWire,
  TrainingRecordSummaryWire,
  TrainingRecordsOverviewWire,
  TrainingRecordsPageWire,
} from "@/schemas/training-records"

export function adaptTrainingRecordSummary(
  wire: TrainingRecordSummaryWire,
): TargetedPracticeRecordSummary | MockInterviewRecordSummary {
  if (wire.kind === "mockInterview") return adaptMockInterviewRecordSummary(wire)
  return {
    id: wire.recordId,
    kind: "targetedPractice",
    language: wire.language,
    status: wire.status,
    startedAt: wire.startedAt,
    endedAt: wire.endedAt,
    durationSeconds: wire.durationSeconds,
    targetRole: {
      id: wire.targetRole.id,
      title: wire.targetRole.title,
      company: wire.targetRole.company,
    },
    answeredQuestionCount: wire.answeredQuestionCount,
    totalQuestionCount: wire.totalQuestionCount,
    overallScore: wire.overallScore,
    reviewSummary: wire.reviewSummary,
    questionType: wire.questionType,
    difficulty: wire.difficulty,
  }
}

function adaptMockInterviewRecordSummary(wire: MockInterviewTrainingRecordSummaryWire) {
  return {
    id: wire.recordId,
    kind: "mockInterview" as const,
    language: wire.language,
    status: wire.status,
    startedAt: wire.startedAt,
    endedAt: wire.endedAt,
    durationSeconds: wire.durationSeconds,
    targetRole: {
      id: wire.targetRole.id,
      title: wire.targetRole.title,
      company: wire.targetRole.company,
    },
    answeredQuestionCount: wire.answeredQuestionCount,
    totalQuestionCount: wire.totalQuestionCount,
    overallScore: wire.overallScore,
    reviewSummary: wire.reviewSummary,
    round: wire.round,
    difficulty: wire.difficulty,
  }
}

export function adaptTrainingRecordsPage(
  wire: TrainingRecordsPageWire,
): TrainingRecordsPageResponse {
  return {
    items: wire.items.map(adaptTrainingRecordSummary),
    pagination: {
      page: wire.pagination.page,
      pageSize: wire.pagination.pageSize,
      totalItems: wire.pagination.totalItems,
      totalPages: wire.pagination.totalPages,
    },
  }
}

export function adaptTrainingRecordsOverview(
  wire: TrainingRecordsOverviewWire,
): TrainingRecordsOverviewResponse {
  return {
    totalRecordCount: wire.totalRecordCount,
    completedRecordCount: wire.completedRecordCount,
    totalDurationSeconds: wire.totalDurationSeconds,
    answeredQuestionCount: wire.answeredQuestionCount,
    averageScore: wire.averageScore,
    targetRoles: wire.targetRoles.map((role) => ({
      id: role.id,
      title: role.title,
      company: role.company,
    })),
    byKind: {
      targetedPractice: {
        recordCount: wire.byKind.targetedPractice.recordCount,
        completedRecordCount: wire.byKind.targetedPractice.completedRecordCount,
        averageScore: wire.byKind.targetedPractice.averageScore,
      },
      mockInterview: {
        recordCount: wire.byKind.mockInterview.recordCount,
        completedRecordCount: wire.byKind.mockInterview.completedRecordCount,
        averageScore: wire.byKind.mockInterview.averageScore,
      },
    },
  }
}

function adaptAnswer(answer: {
  id: string
  content: string
  createdAt: string
}): TrainingRecordAnswer {
  return {
    id: answer.id,
    content: answer.content,
    submittedAt: answer.createdAt,
  }
}

function adaptEvaluation(
  evaluation: TargetedPracticeTrainingRecordEvaluationWire | null,
): TrainingRecordEvaluation | null {
  if (!evaluation) return null
  return {
    overallScore: evaluation.overallScore,
    dimensions: evaluation.dimensionScores,
    evaluatedAt: evaluation.evaluatedAt,
  }
}

function adaptReview(
  review: TargetedPracticeTrainingRecordReviewWire | null,
): TrainingRecordReview | null {
  if (!review) return null
  return {
    summary: review.overallPerformance,
    strengths: review.highlights,
    issues: review.mainIssues,
    improvementSuggestions: review.improvementSuggestions,
    reusableAnswerStructure: review.reusableAnswerStructure,
  }
}

function adaptFollowUp(followUp: TargetedPracticeTrainingRecordFollowUpWire) {
  return {
    id: followUp.questionId,
    prompt: followUp.prompt,
    order: followUp.order,
    askedAt: followUp.askedAt,
    answer: followUp.answer ? adaptAnswer(followUp.answer) : null,
    evaluation: null,
    review: null,
    referenceAnswer: followUp.referenceAnswer,
  }
}

function adaptAttempt(
  attempt: TargetedPracticeTrainingRecordAttemptWire,
): TargetedPracticeQuestion {
  return {
    id: attempt.attemptId,
    prompt: attempt.question.prompt,
    type: attempt.question.questionType,
    order: attempt.attemptNumber,
    attemptNumber: attempt.attemptNumber,
    retryOfQuestionId: attempt.retryOfAttemptId,
    assessedCapabilities: attempt.question.assessedCapabilities,
    isSaved: attempt.question.isSaved,
    isMarkedWeak: attempt.question.isMarkedWeak,
    answer: attempt.mainAnswer ? adaptAnswer(attempt.mainAnswer) : null,
    evaluation: adaptEvaluation(attempt.evaluation),
    review: adaptReview(attempt.review),
    referenceAnswer: attempt.question.referenceAnswer,
    followUps: attempt.followUps.map(adaptFollowUp),
  }
}

function adaptRecommendation(
  recommendation: TargetedPracticeTrainingRecordDetailWire["recommendation"],
  attempts: TargetedPracticeTrainingRecordAttemptWire[],
): TrainingRecordRecommendation | null {
  if (!recommendation) return null

  const lastReviewedAttempt = [...attempts]
    .reverse()
    .find((attempt) => attempt.evaluation !== null && attempt.review !== null)
  if (!lastReviewedAttempt) return null

  if (recommendation.action === "retryCurrent") {
    return {
      action: "retryQuestion",
      reason: recommendation.reason,
      questionType: lastReviewedAttempt.question.questionType,
      difficulty: lastReviewedAttempt.question.difficulty,
      focusAreas: [],
    }
  }

  return {
    action: "targetedPractice",
    reason: recommendation.reason,
    questionType: recommendation.nextQuestion.questionType,
    difficulty: recommendation.nextQuestion.difficulty,
    focusAreas: recommendation.nextQuestion.focusAreas,
  }
}

function getOverallScore(attempts: TargetedPracticeTrainingRecordAttemptWire[]): number | null {
  return (
    [...attempts].reverse().find((attempt) => attempt.evaluation !== null)?.evaluation
      ?.overallScore ?? null
  )
}

export function adaptTargetedPracticeRecord(
  wire: TargetedPracticeTrainingRecordDetailWire,
): TargetedPracticeRecordDetailResponse {
  const attempts = wire.attempts.map(adaptAttempt)
  const firstQuestion = wire.attempts[0]?.question
  if (!firstQuestion) {
    throw new TypeError("A targeted practice record must contain a first question.")
  }

  return {
    id: wire.recordId,
    kind: "targetedPractice",
    language: wire.language,
    status: wire.status,
    startedAt: wire.startedAt,
    endedAt: wire.endedAt,
    durationSeconds: wire.durationSeconds,
    targetRole: wire.targetRole,
    answeredQuestionCount: wire.attempts.filter((attempt) => attempt.mainAnswer !== null).length,
    totalQuestionCount: wire.attempts.length,
    overallScore: getOverallScore(wire.attempts),
    questions: attempts,
    exposedWeaknesses: wire.exposedWeaknesses,
    recommendation: adaptRecommendation(wire.recommendation, wire.attempts),
    setup: {
      questionType: firstQuestion.questionType,
      difficulty: firstQuestion.difficulty,
      source: wire.setup.source,
      prioritizedWeaknesses: wire.setup.prioritizeWeaknesses,
    },
  }
}

function adaptInterviewReferenceAnswer(
  referenceAnswer: MockInterviewTrainingRecordDetailWire["questionDetails"][number]["referenceAnswer"],
) {
  if (referenceAnswer.status !== "ready") {
    throw new TypeError("A Mock Interview training record requires ready reference answers.")
  }
  return {
    status: "ready" as const,
    content: referenceAnswer.content,
  }
}

function adaptInterviewEvaluation(score: number, evaluatedAt: string): TrainingRecordEvaluation {
  return { overallScore: score, dimensions: [], evaluatedAt }
}

function adaptMockInterviewQuestion(
  detail: MockInterviewTrainingRecordDetailWire["questionDetails"][number],
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
    assessedCapabilities: record.question.assessedCapabilities,
    isSaved: false,
    isMarkedWeak: false,
    answer: record.answer
      ? {
          id: record.answer.id,
          content: record.answer.content,
          submittedAt: record.answer.submittedAt,
        }
      : null,
    evaluation:
      detail.performance === null
        ? null
        : adaptInterviewEvaluation(detail.performance.score, evaluatedAt),
    review:
      detail.performance === null
        ? null
        : {
            summary: detail.performance.summary,
            strengths: detail.performance.strengths,
            issues: detail.performance.issues,
            improvementSuggestions: [...suggestions],
            reusableAnswerStructure: [],
          },
    referenceAnswer: adaptInterviewReferenceAnswer(detail.referenceAnswer),
    followUps: detail.followUps.map((followUp) => ({
      id: followUp.record.question.id,
      prompt: followUp.record.question.prompt,
      order: followUp.record.question.order,
      askedAt: followUp.record.question.createdAt,
      answer: followUp.record.answer
        ? {
            id: followUp.record.answer.id,
            content: followUp.record.answer.content,
            submittedAt: followUp.record.answer.submittedAt,
          }
        : null,
      evaluation:
        followUp.performance === null
          ? null
          : adaptInterviewEvaluation(followUp.performance.score, evaluatedAt),
      review:
        followUp.performance === null
          ? null
          : {
              summary: followUp.performance.summary,
              strengths: followUp.performance.strengths,
              issues: followUp.performance.issues,
              improvementSuggestions: [...suggestions],
              reusableAnswerStructure: [],
            },
      referenceAnswer: adaptInterviewReferenceAnswer(followUp.referenceAnswer),
    })),
  }
}

function adaptMockInterviewRecommendation(
  record: MockInterviewTrainingRecordDetailWire,
): TrainingRecordRecommendation {
  if (record.review.status === "complete") {
    const nextTraining = record.review.review.nextTraining
    return nextTraining.action === "targetedPractice"
      ? {
          action: "targetedPractice",
          reason: nextTraining.reason,
          questionType: nextTraining.questionType,
          difficulty: nextTraining.difficulty,
          focusAreas: nextTraining.focusAreas,
        }
      : {
          action: "mockInterview",
          reason: nextTraining.reason,
          round: nextTraining.round,
          difficulty: nextTraining.difficulty,
          focusAreas: nextTraining.focusAreas,
        }
  }
  if (record.review.status === "partial") {
    const firstAnswered = record.questionDetails.find(
      (detail) => detail.record.status === "answered",
    )
    return firstAnswered === undefined
      ? { action: "none", reason: record.review.review.overallPerformance }
      : {
          action: "targetedPractice",
          reason:
            record.review.review.preparationSuggestions[0] ??
            record.review.review.overallPerformance,
          questionType: firstAnswered.record.question.type,
          difficulty: record.setup.difficulty,
          focusAreas: firstAnswered.performance?.issues ?? [],
        }
  }
  return {
    action: "mockInterview",
    reason: "有效回答不足，建议重新完成一轮模拟面试。",
    round: record.setup.round,
    difficulty: record.setup.difficulty,
    focusAreas: [],
  }
}

export function adaptMockInterviewRecord(
  wire: MockInterviewTrainingRecordDetailWire,
): MockInterviewRecordDetailResponse {
  const review = wire.review.status === "unavailable" ? null : wire.review.review
  const evaluatedAt = review?.generatedAt ?? wire.endedAt
  const suggestions =
    review === null ? [] : [...review.communicationSuggestions, ...review.preparationSuggestions]
  const questions = wire.questionDetails.map((detail) =>
    adaptMockInterviewQuestion(detail, evaluatedAt, suggestions),
  )
  const overallReview =
    wire.review.status === "unavailable"
      ? { status: "unavailable" as const, content: null, reason: "insufficientAnswers" as const }
      : {
          status: wire.review.status,
          content: {
            summary: wire.review.review.overallPerformance,
            mainStrengths: wire.review.review.mainStrengths,
            frequentIssues: wire.review.review.frequentIssues,
            riskPoints: wire.review.review.riskPoints,
            communicationSuggestions: wire.review.review.communicationSuggestions,
            preparationSuggestions: wire.review.review.preparationSuggestions,
            generatedAt: wire.review.review.generatedAt,
          },
        }

  return {
    id: wire.recordId,
    kind: "mockInterview",
    language: wire.language,
    status: wire.status,
    startedAt: wire.startedAt,
    endedAt: wire.endedAt,
    durationSeconds: wire.durationSeconds,
    targetRole: wire.targetRole,
    answeredQuestionCount: questions.filter((question) => question.answer !== null).length,
    totalQuestionCount: questions.length,
    overallScore: wire.review.status === "complete" ? wire.review.review.overallScore : null,
    setup: wire.setup,
    questions,
    exposedWeaknesses: review?.exposedWeaknesses ?? [],
    recommendation: adaptMockInterviewRecommendation(wire),
    overallReview,
    completionReason: wire.completionReason,
    candidateQuestionExchanges: wire.candidateQuestionExchanges.map((exchange) => ({
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
    })),
  }
}
