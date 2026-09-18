import type {
  CreatePracticeRequest,
  PracticeDifficulty,
  PracticeGuidance,
  PracticeQuestionTurnResponse,
  PracticeQuestionType,
  PracticeRoleResponse,
  PracticeAnswerTurnResponse,
} from "@/api/generated/models"

export type PracticeSelection = Omit<CreatePracticeRequest, "roleId"> & {
  roleId: string | null
}

export type ActiveSelection = CreatePracticeRequest

export type PracticeQuestion = {
  id: PracticeQuestionTurnResponse["id"]
  prompt: string
  criteria: PracticeQuestionTurnResponse["criteria"]
  guidance: PracticeGuidance
  referenceAnswer: string
}

export type PracticeAnswer = Pick<PracticeAnswerTurnResponse, "id" | "content">

export type PracticeFollowUp = Pick<
  PracticeQuestion,
  "id" | "prompt" | "guidance" | "referenceAnswer"
>

export type PracticeSessionContext = {
  practiceId: string
  roundId: string
  role: PracticeRoleResponse
}

type CreatedSession = {
  context: PracticeSessionContext
  selection: PracticeSelection
}

export type SetupSession = {
  status: "setup"
  selection: PracticeSelection
}

export type GeneratingSession = CreatedSession & {
  status: "generatingQuestion"
  // A restarted round keeps its main question while its task initializes.
  question: PracticeQuestion | null
}

export type AnsweringSession = CreatedSession & {
  status: "answering"
  question: PracticeQuestion
}

export type AnsweringFollowUpSession = CreatedSession & {
  status: "answeringFollowUp"
  question: PracticeQuestion
  mainAnswer: PracticeAnswer
  followUps: {
    question: PracticeFollowUp
    answer: PracticeAnswer
  }[]
  currentFollowUp: PracticeFollowUp
}

export type ProcessingSession = CreatedSession & {
  status: "processing"
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

export type CompletedSession = CreatedSession & {
  status: "completed"
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
