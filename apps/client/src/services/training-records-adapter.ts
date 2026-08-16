import type {
  TargetedPracticeRecordSummary,
  TargetedPracticeRecordDetailResponse,
  TargetedPracticeQuestion,
  TrainingRecordAnswer,
  TrainingRecordEvaluation,
  TrainingRecordRecommendation,
  TrainingRecordReview,
  TrainingRecordsOverviewResponse,
  TrainingRecordsPageResponse,
} from "@/models/training-records"
import type {
  TargetedPracticeTrainingRecordAttemptWire,
  TargetedPracticeTrainingRecordDetailWire,
  TargetedPracticeTrainingRecordEvaluationWire,
  TargetedPracticeTrainingRecordFollowUpWire,
  TargetedPracticeTrainingRecordReviewWire,
  TargetedPracticeTrainingRecordSummaryWire,
  TrainingRecordsOverviewWire,
  TrainingRecordsPageWire,
} from "@/schemas/training-records"

export function adaptTrainingRecordSummary(
  wire: TargetedPracticeTrainingRecordSummaryWire,
): TargetedPracticeRecordSummary {
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
