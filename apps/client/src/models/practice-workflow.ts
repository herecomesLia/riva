import type {
  PracticeDifficulty,
  PracticeGuidance,
  PracticeQuestionTurnResponse,
  PracticeQuestionType,
} from "@/api/generated/models"

export type PracticeSelection = {
  roleId: string | null
  questionType: PracticeQuestionType
  difficulty: PracticeDifficulty
}

export type ActiveSelection = PracticeSelection & {
  roleId: string
}

export type PracticeQuestion = {
  prompt: string
  criteria: PracticeQuestionTurnResponse["criteria"]
  guidance: PracticeGuidance
  referenceAnswer: string
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

export type ProcessingSession = {
  status: "processing"
  selection: ActiveSelection
  question: PracticeQuestion
  mainAnswer: PracticeAnswer
  followUps: {
    question: PracticeFollowUp
    answer: PracticeAnswer
  }[]
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

export type PracticeReview = {
  overallPerformance: string
  highlights: string[]
  mainIssues: string[]
  improvementSuggestions: string[]
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
  finalAttemptAverageScore: number
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
}

export type PracticeData = {
  setupContext: PracticeSetupContext
  session: PracticeSession
}
