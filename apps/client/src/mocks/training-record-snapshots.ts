import type {
  InterviewCandidateQuestionExchangeResponse,
  InterviewCompletedSessionResponse,
  InterviewPageResponse,
  InterviewQuestionLearningDetailResponse,
  InterviewReferenceAnswerResponse,
} from "@/models/interview"
import type {
  PracticeAttemptRecord,
  PracticeCompletedState,
  PracticeFollowUpReferenceAnswerState,
  PracticePageResponse,
  PracticeReferenceAnswerState,
  UnfinishedPracticeAttempt,
} from "@/models/practice"
import type {
  MockInterviewOverallReviewState,
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
  TrainingRecordEvaluation,
  TrainingRecordFollowUp,
  TrainingRecordQuestion,
  TrainingRecordRecommendation,
  TrainingRecordReferenceAnswer,
  TrainingRecordReview,
} from "@/models/training-records"

type CompletedPracticePage = PracticePageResponse & { session: PracticeCompletedState }
type CompletedInterviewPage = InterviewPageResponse & {
  session: InterviewCompletedSessionResponse
}

function durationSeconds(startedAt: string, endedAt: string): number {
  return Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000))
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function practiceReferenceAnswer(
  state: PracticeReferenceAnswerState,
): TrainingRecordReferenceAnswer {
  if (state.status === "notRequested") return { status: "notRequested", content: null }
  if (state.status === "unavailable") {
    return { status: "unavailable", content: null, reason: "generationFailed" }
  }
  return {
    status: "ready",
    content: {
      recommendedStructure: state.content.keyPoints,
      keyPoints: state.content.keyPoints,
      exampleAnswer: state.content.answer,
      usageGuidance: state.content.commonMistakes.join("；"),
      generatedAt: state.content.generatedAt,
    },
  }
}

function practiceFollowUpReferenceAnswer(
  state: PracticeFollowUpReferenceAnswerState,
): TrainingRecordReferenceAnswer {
  if (state.status === "notRequested") return { status: "notRequested", content: null }
  if (state.status === "unavailable") {
    return { status: "unavailable", content: null, reason: "generationFailed" }
  }
  return {
    status: "ready",
    content: {
      recommendedStructure: state.content.keyPoints,
      keyPoints: state.content.keyPoints,
      exampleAnswer: state.content.answer,
      usageGuidance: state.content.commonMistakes.join("；"),
      generatedAt: state.content.generatedAt,
    },
  }
}

function practiceEvaluation(record: PracticeAttemptRecord): TrainingRecordEvaluation {
  return {
    overallScore: record.evaluation.overallScore,
    dimensions: structuredClone(record.evaluation.dimensionScores),
    evaluatedAt: record.evaluation.evaluatedAt,
  }
}

function practiceReview(record: PracticeAttemptRecord): TrainingRecordReview {
  return {
    summary: record.review.overallPerformance,
    strengths: structuredClone(record.review.highlights),
    issues: structuredClone(record.review.mainIssues),
    improvementSuggestions: structuredClone(record.review.improvementSuggestions),
    reusableAnswerStructure: structuredClone(record.review.reusableAnswerStructure),
  }
}

function practiceFollowUps(record: PracticeAttemptRecord): TrainingRecordFollowUp[] {
  const answered = record.followUpExchanges.map(({ answer, question }) => ({
    id: `${record.attemptId}:${question.id}`,
    prompt: question.prompt,
    order: question.order,
    askedAt: question.createdAt,
    answer: {
      id: answer.id,
      content: answer.content,
      submittedAt: answer.createdAt,
    },
    evaluation: null,
    review: null,
    referenceAnswer: practiceFollowUpReferenceAnswer(question.referenceAnswer),
  }))
  if (record.followUpCompletion.status !== "endedEarly") return answered

  const question = record.followUpCompletion.unansweredQuestion
  return [
    ...answered,
    {
      id: `${record.attemptId}:${question.id}`,
      prompt: question.prompt,
      order: question.order,
      askedAt: question.createdAt,
      answer: null,
      evaluation: null,
      review: null,
      referenceAnswer: practiceFollowUpReferenceAnswer(question.referenceAnswer),
    },
  ]
}

function completedPracticeQuestions(
  records: readonly PracticeAttemptRecord[],
): TrainingRecordQuestion[] {
  const latestAttemptByQuestion = new Map<string, string>()
  return records.map((record, index) => {
    const retryOfQuestionId = latestAttemptByQuestion.get(record.question.id) ?? null
    latestAttemptByQuestion.set(record.question.id, record.attemptId)
    return {
      id: record.attemptId,
      prompt: record.question.prompt,
      type: record.question.questionType,
      order: index + 1,
      attemptNumber: record.attemptNumber,
      retryOfQuestionId,
      assessedCapabilities: structuredClone(record.question.assessedCapabilities),
      isSaved: record.question.isSaved,
      isMarkedWeak: record.question.isMarkedWeak,
      answer: {
        id: record.mainAnswer.id,
        content: record.mainAnswer.content,
        submittedAt: record.mainAnswer.createdAt,
      },
      evaluation: practiceEvaluation(record),
      review: practiceReview(record),
      referenceAnswer: practiceReferenceAnswer(record.question.referenceAnswer),
      followUps: practiceFollowUps(record),
    }
  })
}

function unfinishedPracticeQuestion(
  attempt: UnfinishedPracticeAttempt,
  order: number,
  retryOfQuestionId: string | null,
): TrainingRecordQuestion {
  return {
    id: attempt.attemptId,
    prompt: attempt.question.prompt,
    type: attempt.question.questionType,
    order,
    attemptNumber: attempt.attemptNumber,
    retryOfQuestionId,
    assessedCapabilities: structuredClone(attempt.question.assessedCapabilities),
    isSaved: attempt.question.isSaved,
    isMarkedWeak: attempt.question.isMarkedWeak,
    answer: null,
    evaluation: null,
    review: null,
    referenceAnswer: practiceReferenceAnswer(attempt.question.referenceAnswer),
    followUps: [],
  }
}

function practiceRecommendation(session: PracticeCompletedState): TrainingRecordRecommendation {
  const latest = session.attemptRecords.at(-1)
  if (latest === undefined) {
    return { action: "none", reason: session.nextStepSuggestion }
  }
  if (latest.review.recommendation.action === "retryCurrent") {
    return {
      action: "retryQuestion",
      reason: latest.review.recommendation.reason,
      questionType: latest.selection.questionType,
      difficulty: latest.selection.difficulty,
      focusAreas: unique([...latest.review.mainIssues, ...latest.review.exposedWeaknesses]),
    }
  }
  return {
    action: "targetedPractice",
    reason: latest.review.recommendation.reason,
    questionType: latest.review.recommendation.nextQuestion.questionType,
    difficulty: latest.review.recommendation.nextQuestion.difficulty,
    focusAreas: structuredClone(latest.review.recommendation.nextQuestion.focusAreas),
  }
}

export function createTargetedPracticeRecordSnapshot(
  page: CompletedPracticePage,
): TargetedPracticeRecordDetailResponse {
  const { session } = page
  const targetRole = page.setupContext.targetRoles.find(
    (candidate) => candidate.id === session.selection.targetRoleId,
  )
  if (targetRole === undefined) {
    throw new Error("Cannot create a training record without the target role snapshot.")
  }

  const questions = completedPracticeQuestions(session.attemptRecords)
  if (session.unfinishedAttempt !== null) {
    const previous = [...session.attemptRecords]
      .reverse()
      .find((record) => record.question.id === session.unfinishedAttempt?.question.id)
    questions.push(
      unfinishedPracticeQuestion(
        session.unfinishedAttempt,
        questions.length + 1,
        previous?.attemptId ?? null,
      ),
    )
  }
  const partiallyCompleted =
    session.attemptRecords.some((record) => record.followUpCompletion.status === "endedEarly") ||
    (session.completionReason === "userEndedEarly" && session.attemptRecords.length > 0)

  return {
    id: `targeted-practice-record-${session.sessionId}`,
    kind: "targetedPractice",
    language: session.language,
    status:
      session.completionReason === "userEndedEarly" && session.attemptRecords.length === 0
        ? "endedEarly"
        : partiallyCompleted
          ? "partiallyCompleted"
          : "completed",
    startedAt: session.startedAt,
    endedAt: session.completedAt,
    durationSeconds: durationSeconds(session.startedAt, session.completedAt),
    targetRole: {
      id: targetRole.id,
      title: targetRole.title,
      company: targetRole.company,
    },
    answeredQuestionCount: session.attemptRecords.length,
    totalQuestionCount: questions.length,
    overallScore: session.attemptRecords.length === 0 ? null : session.finalAttemptAverageScore,
    setup: {
      questionType: session.selection.questionType,
      difficulty: session.selection.difficulty,
      source: session.selection.source,
      prioritizedWeaknesses: session.selection.prioritizeWeaknesses,
    },
    questions,
    exposedWeaknesses: unique(
      session.attemptRecords.flatMap((record) => record.review.exposedWeaknesses),
    ),
    recommendation: practiceRecommendation(session),
  }
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
  session: InterviewCompletedSessionResponse,
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
  session: InterviewCompletedSessionResponse,
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
    language: session.language,
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
