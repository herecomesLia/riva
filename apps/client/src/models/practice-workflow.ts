export type QuestionType =
  "projectDeepDive" | "behavioral" | "businessUnderstanding" | "motivation" | "technicalFoundation"

export type Difficulty = "basic" | "pressure"

export type QuestionSource = "personalized" | "saved" | "history"

export type PracticeSelection = {
  roleId: string | null
  questionType: QuestionType
  difficulty: Difficulty
  source: QuestionSource
  prioritizeWeaknesses: boolean
}

export type ActiveSelection = PracticeSelection & {
  roleId: string
}

export type Guidance<T> =
  | { status: "notRequested"; content: null }
  | { status: "revealed"; content: T }
  | { status: "unavailable"; content: null }

export type PracticeReferenceAnswer = {
  kind: "personalizedExample" | "technicalReference"
  answer: string
  keyPoints: string[]
  commonMistakes: string[]
}

export type ReferenceAnswerState =
  | {
      status: "notRequested"
      content: null
      viewedBeforeSubmission: false
    }
  | {
      status: "revealed"
      content: PracticeReferenceAnswer
      viewedBeforeSubmission: boolean
    }
  | {
      status: "unavailable"
      content: null
      viewedBeforeSubmission: false
    }

export type PracticeQuestion = {
  prompt: string
  assessedCapabilities: string[]
  recommendedMaterials: string[]
  hints: Guidance<string[]>
  framework: Guidance<string[]>
  referenceAnswer: ReferenceAnswerState
  isSaved: boolean
  isWeak: boolean
}

export type PracticeAnswer = {
  content: string
}

export type FollowUpReferenceAnswer = {
  kind: "personalizedSupplement" | "technicalReference"
  addressedGap: string
  answer: string
  keyPoints: string[]
  commonMistakes: string[]
}

export type FollowUpReferenceState =
  | {
      status: "notRequested"
      content: null
      viewedBeforeSubmission: false
    }
  | {
      status: "revealed"
      content: FollowUpReferenceAnswer
      viewedBeforeSubmission: boolean
    }
  | {
      status: "unavailable"
      content: null
      viewedBeforeSubmission: false
    }

export type PracticeFollowUp = {
  prompt: string
  hints: Guidance<string[]>
  framework: Guidance<string[]>
  referenceAnswer: FollowUpReferenceState
}

export type SetupSession = {
  status: "setup"
  selection: PracticeSelection
}

export type GeneratingSession = {
  status: "generatingQuestion"
  selection: ActiveSelection
}

export type AnsweringSession = {
  status: "answering"
  assistedRetry: boolean
  selection: ActiveSelection
  question: PracticeQuestion
}

export type AnsweringFollowUpSession = {
  status: "answeringFollowUp"
  selection: ActiveSelection
  question: PracticeQuestion
  mainAnswer: PracticeAnswer
  followUps: {
    question: PracticeFollowUp
    answer: PracticeAnswer
  }[]
  currentFollowUp: PracticeFollowUp
}

export type FollowUpCompletion =
  | { status: "completed" }
  | {
      status: "endedEarly"
      unanswered: PracticeFollowUp
    }

export type EvaluatingSession = {
  status: "evaluating"
  selection: ActiveSelection
  question: PracticeQuestion
  mainAnswer: PracticeAnswer
  followUps: {
    question: PracticeFollowUp
    answer: PracticeAnswer
  }[]
  followUpCompletion: FollowUpCompletion
}

export type ScoreDimension =
  | "relevance"
  | "structure"
  | "specificity"
  | "personalContribution"
  | "resultsAndEvidence"
  | "roleAlignment"
  | "communication"
  | "riskControl"

export type DimensionScore = {
  dimension: ScoreDimension
  score: number
  explanation: string
}

export type PracticeEvaluation = {
  overallScore: number
  dimensionScores: DimensionScore[]
}

export type PracticeRecommendation =
  | {
      action: "retryCurrent"
      reason: string
    }
  | {
      action: "nextQuestion"
      reason: string
      nextQuestion: {
        questionType: QuestionType
        difficulty: Difficulty
        focusAreas: string[]
      }
    }

export type PracticeReview = {
  overallPerformance: string
  highlights: string[]
  mainIssues: string[]
  improvementSuggestions: string[]
  exposedWeaknesses: string[]
  recommendation: PracticeRecommendation
}

export type ReviewSession = Omit<EvaluatingSession, "status"> & {
  status: "review"
  attemptNumber: number
  evaluation: PracticeEvaluation
  review: PracticeReview
}

export type CompletedSession = {
  status: "completed"
  selection: ActiveSelection
  questionsCompleted: number
  retryCount: number
  savedQuestionCount: number
  weakQuestionCount: number
  finalAttemptAverageScore: number
  nextStepSuggestion: string
}

export type PracticeSession =
  | SetupSession
  | GeneratingSession
  | AnsweringSession
  | AnsweringFollowUpSession
  | EvaluatingSession
  | ReviewSession
  | CompletedSession

export type PracticeRoleOption = {
  id: string
  title: string
  company: string | null
  supportedQuestionTypes: QuestionType[]
}

export type PracticeSetupContext = {
  roles: PracticeRoleOption[]
  availableDifficulties: Difficulty[]
  eligibleQuestionCounts: { saved: number; history: number }
}

export type PracticeData = {
  setupContext: PracticeSetupContext
  session: PracticeSession
}
