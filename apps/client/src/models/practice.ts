export type PracticeQuestionType =
  "projectDeepDive" | "behavioral" | "businessUnderstanding" | "motivation" | "technicalFoundation"

export type PracticeDifficulty = "basic" | "pressure"

export type PracticeQuestionSource = "personalized" | "saved" | "history"

export type PracticeSetupSelection = {
  targetRoleId: string | null
  questionType: PracticeQuestionType
  difficulty: PracticeDifficulty
  source: PracticeQuestionSource
  prioritizeWeaknesses: boolean
}

export type ActivePracticeSelection = Omit<PracticeSetupSelection, "targetRoleId"> & {
  targetRoleId: string
}

export type PracticeTargetRoleOption = {
  id: string
  title: string
  company: string | null
  supportedQuestionTypes: PracticeQuestionType[]
}

export type PracticeSetupContext = {
  targetRoles: PracticeTargetRoleOption[]
  defaultTargetRoleId: string | null
  eligibleQuestionCounts: {
    saved: number
    history: number
  }
}

export type PracticeQuestionCard = {
  id: string
  prompt: string
  questionType: PracticeQuestionType
  difficulty: PracticeDifficulty
  assessedCapabilities: string[]
  recommendedMaterials: string[]
  answerHints: PracticeGuidance<string[]>
  answerFramework: PracticeGuidance<string[]>
  isSaved: boolean
  isMarkedWeak: boolean
}

export type PracticeGuidance<T> =
  | {
      status: "notRequested"
      content: null
    }
  | {
      status: "revealed"
      content: T
    }
  | {
      status: "unavailable"
      content: null
    }

export type PracticeAnswer = {
  id: string
  content: string
  createdAt: string
  order: number
}

export type PracticeFollowUpQuestion = {
  id: string
  prompt: string
  createdAt: string
  order: number
}

export type AnsweredPracticeFollowUpExchange = {
  status: "answered"
  question: PracticeFollowUpQuestion
  answer: PracticeAnswer
}

export type AwaitingPracticeFollowUpExchange = {
  status: "awaitingAnswer"
  question: PracticeFollowUpQuestion
  answer: null
}

export type PracticeFollowUpExchange =
  AnsweredPracticeFollowUpExchange | AwaitingPracticeFollowUpExchange

export type PracticeScoreDimension =
  | "relevance"
  | "structure"
  | "specificity"
  | "personalContribution"
  | "resultsAndEvidence"
  | "roleAlignment"
  | "communication"
  | "riskControl"

export type PracticeDimensionScore = {
  dimension: PracticeScoreDimension
  /** Whole-number score from 0 to 100. */
  score: number
  explanation: string
}

export type PracticeEvaluation = {
  /** Whole-number score from 0 to 100. */
  overallScore: number
  dimensionScores: PracticeDimensionScore[]
  evaluatedAt: string
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
        questionType: PracticeQuestionType
        difficulty: PracticeDifficulty
        focusAreas: string[]
      }
    }

export type PracticeReview = {
  overallPerformance: string
  highlights: string[]
  mainIssues: string[]
  improvementSuggestions: string[]
  reusableAnswerStructure: string[]
  exposedWeaknesses: string[]
  recommendation: PracticeRecommendation
}

type PracticeActiveSessionBase = {
  sessionId: string
  /** Positive integer incremented by persisted session state changes. */
  version: number
  selection: ActivePracticeSelection
  startedAt: string
}

type PracticeQuestionSessionBase = PracticeActiveSessionBase & {
  question: PracticeQuestionCard
}

type PracticeSubmittedAnswerRecord = PracticeQuestionSessionBase & {
  mainAnswer: PracticeAnswer
  followUpExchanges: AnsweredPracticeFollowUpExchange[]
}

export type PracticeSetupState = {
  status: "setup"
  selection: PracticeSetupSelection
}

export type PracticeGeneratingQuestionState = PracticeActiveSessionBase & {
  status: "generatingQuestion"
}

export type PracticeAnsweringState = PracticeQuestionSessionBase & {
  status: "answering"
}

export type PracticeAnsweringFollowUpState = PracticeQuestionSessionBase & {
  status: "answeringFollowUp"
  mainAnswer: PracticeAnswer
  followUpExchanges: AnsweredPracticeFollowUpExchange[]
  currentFollowUp: AwaitingPracticeFollowUpExchange
}

export type PracticeEvaluatingState = PracticeSubmittedAnswerRecord & {
  status: "evaluating"
  submittedAt: string
}

export type PracticeReviewState = PracticeSubmittedAnswerRecord & {
  status: "review"
  evaluation: PracticeEvaluation
  review: PracticeReview
}

export type PracticeCompletedState = PracticeActiveSessionBase & {
  status: "completed"
  completedAt: string
  questionsCompleted: number
}

export type PracticeSessionState =
  | PracticeSetupState
  | PracticeGeneratingQuestionState
  | PracticeAnsweringState
  | PracticeAnsweringFollowUpState
  | PracticeEvaluatingState
  | PracticeReviewState
  | PracticeCompletedState

export type PracticePageResponse = {
  setupContext: PracticeSetupContext
  session: PracticeSessionState
}
