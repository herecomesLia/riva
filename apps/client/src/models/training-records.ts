export type TrainingRecordKind = "targetedPractice" | "mockInterview"

export type TrainingRecordStatus = "completed" | "endedEarly" | "partiallyCompleted"

export type TrainingRecordDifficulty = "basic" | "pressure"

export type TrainingRecordQuestionType =
  | "selfIntroduction"
  | "projectDeepDive"
  | "roleCapability"
  | "behavioral"
  | "technicalOrBusiness"
  | "businessUnderstanding"
  | "technicalFoundation"
  | "resumeRisk"
  | "motivation"

export type TrainingRecordInterviewRound =
  "hr" | "firstBusiness" | "technical" | "manager" | "final" | "comprehensive"

export type TrainingRecordTargetRole = {
  id: string
  title: string
  company: string | null
}

export type TrainingRecordAnswer = {
  id: string
  content: string
  submittedAt: string
}

export type TrainingRecordScoreDimension =
  | "relevance"
  | "structure"
  | "specificity"
  | "personalContribution"
  | "resultsAndEvidence"
  | "roleAlignment"
  | "communication"
  | "riskControl"

export type TrainingRecordEvaluation = {
  /** Whole-number score from 0 to 100. */
  overallScore: number
  dimensions: Array<{
    dimension: TrainingRecordScoreDimension
    score: number
    explanation: string
  }>
  evaluatedAt: string
}

export type TrainingRecordReview = {
  summary: string
  strengths: string[]
  issues: string[]
  improvementSuggestions: string[]
}

export type TrainingRecordReferenceAnswer =
  | {
      status: "notRequested"
      content: null
    }
  | {
      status: "ready"
      content: {
        recommendedStructure: string[]
        keyPoints: string[]
        exampleAnswer: string
        usageGuidance: string
        generatedAt: string
      }
    }
  | {
      status: "generating"
      content: null
    }
  | {
      status: "unavailable"
      content: null
      reason: "generationFailed" | "insufficientContext"
    }

export type TrainingRecordFollowUp = {
  id: string
  prompt: string
  order: number
  askedAt: string
  answer: TrainingRecordAnswer | null
  evaluation: TrainingRecordEvaluation | null
  review: TrainingRecordReview | null
  referenceAnswer: TrainingRecordReferenceAnswer
}

export type TrainingRecordQuestion = {
  id: string
  prompt: string
  type: TrainingRecordQuestionType
  order: number
  assessedCapabilities: string[]
  answer: TrainingRecordAnswer | null
  evaluation: TrainingRecordEvaluation | null
  review: TrainingRecordReview | null
  referenceAnswer: TrainingRecordReferenceAnswer
  followUps: TrainingRecordFollowUp[]
}

export type TrainingRecordRecommendation =
  | {
      action: "retryQuestion"
      reason: string
      questionType: TrainingRecordQuestionType
      difficulty: TrainingRecordDifficulty
      focusAreas: string[]
    }
  | {
      action: "targetedPractice"
      reason: string
      questionType: TrainingRecordQuestionType
      difficulty: TrainingRecordDifficulty
      focusAreas: string[]
    }
  | {
      action: "mockInterview"
      reason: string
      round: TrainingRecordInterviewRound
      difficulty: TrainingRecordDifficulty
      focusAreas: string[]
    }
  | {
      action: "none"
      reason: string
    }

type TrainingRecordBase = {
  id: string
  status: TrainingRecordStatus
  startedAt: string
  endedAt: string
  durationSeconds: number
  targetRole: TrainingRecordTargetRole
  answeredQuestionCount: number
  totalQuestionCount: number
  overallScore: number | null
}

type TrainingRecordSummaryBase = TrainingRecordBase & {
  reviewSummary: string | null
}

export type TargetedPracticeRecordSummary = TrainingRecordSummaryBase & {
  kind: "targetedPractice"
  questionType: TrainingRecordQuestionType
  difficulty: TrainingRecordDifficulty
}

export type MockInterviewRecordSummary = TrainingRecordSummaryBase & {
  kind: "mockInterview"
  round: TrainingRecordInterviewRound
  difficulty: TrainingRecordDifficulty
}

export type TrainingRecordSummary = TargetedPracticeRecordSummary | MockInterviewRecordSummary

export type TrainingRecordsOverviewResponse = {
  totalRecordCount: number
  completedRecordCount: number
  totalDurationSeconds: number
  answeredQuestionCount: number
  averageScore: number | null
  targetRoles: TrainingRecordTargetRole[]
  byKind: Record<
    TrainingRecordKind,
    {
      recordCount: number
      completedRecordCount: number
      averageScore: number | null
    }
  >
}

export type ListTrainingRecordsInput = {
  kinds?: TrainingRecordKind[]
  statuses?: TrainingRecordStatus[]
  targetRoleId?: string
  startedAtFrom?: string
  startedAtTo?: string
  page: number
  pageSize: number
}

export type TrainingRecordsPageResponse = {
  items: TrainingRecordSummary[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

type TrainingRecordDetailBase = TrainingRecordBase & {
  questions: TrainingRecordQuestion[]
  exposedWeaknesses: string[]
  recommendation: TrainingRecordRecommendation | null
}

export type TargetedPracticeRecordDetailResponse = TrainingRecordDetailBase & {
  kind: "targetedPractice"
  setup: {
    questionType: TrainingRecordQuestionType
    difficulty: TrainingRecordDifficulty
    source: "personalized" | "saved" | "history"
    prioritizedWeaknesses: boolean
  }
}

export type MockInterviewOverallReview = {
  summary: string
  mainStrengths: string[]
  frequentIssues: string[]
  riskPoints: string[]
  communicationSuggestions: string[]
  preparationSuggestions: string[]
  generatedAt: string
}

export type MockInterviewRecordDetailResponse = TrainingRecordDetailBase & {
  kind: "mockInterview"
  setup: {
    round: TrainingRecordInterviewRound
    difficulty: TrainingRecordDifficulty
    plannedDurationMinutes: 15 | 30 | 45
  }
  overallReview: MockInterviewOverallReview | null
  candidateQuestionExchanges: Array<{
    id: string
    question: string
    interviewerAnswer: string
    feedback: string
    submittedAt: string
  }>
}

export class TrainingRecordNotFoundError extends Error {
  readonly code = "trainingRecordNotFound"
  readonly recordKind: TrainingRecordKind
  readonly recordId: string

  constructor(recordKind: TrainingRecordKind, recordId: string) {
    super(`Training record "${recordId}" was not found for kind "${recordKind}".`)
    this.name = "TrainingRecordNotFoundError"
    this.recordKind = recordKind
    this.recordId = recordId
  }
}
