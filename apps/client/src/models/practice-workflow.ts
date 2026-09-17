import type {
  PracticeDifficulty,
  PracticeGuidance,
  PracticeQuestionType,
} from "@/api/generated/models"

export type QuestionSource = "personalized" | "saved" | "history"

export type PracticeSelection = {
  roleId: string | null
  questionType: PracticeQuestionType
  difficulty: PracticeDifficulty
  source: QuestionSource
  prioritizeWeaknesses: boolean
}

export type ActiveSelection = PracticeSelection & {
  roleId: string
}

export type PracticeQuestion = {
  prompt: string
  assessedCapabilities: string[]
  recommendedMaterials: string[]
  guidance: PracticeGuidance
  referenceAnswer: string
  isSaved: boolean
  isWeak: boolean
}

export type PracticeAnswer = {
  content: string
}

export type PracticeFollowUp = Pick<PracticeQuestion, "prompt" | "guidance" | "referenceAnswer">

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

export type ProcessingSession = {
  status: "processing"
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
  exposedWeaknesses: string[]
  recommendation: PracticeRecommendation
}

export type ReviewSession = Omit<ProcessingSession, "status"> & {
  status: "review"
  evaluation: PracticeEvaluation
  review: PracticeReview
}

export type CompletedSession = {
  status: "completed"
  selection: ActiveSelection
  questionsCompleted: number
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
  | ProcessingSession
  | ReviewSession
  | CompletedSession

export type PracticeRoleOption = {
  id: string
  title: string
  company: string | null
  supportedQuestionTypes: PracticeQuestionType[]
}

export type PracticeSetupContext = {
  roles: PracticeRoleOption[]
  availableDifficulties: PracticeDifficulty[]
  eligibleQuestionCounts: { saved: number; history: number }
}

export type PracticeData = {
  setupContext: PracticeSetupContext
  session: PracticeSession
}
