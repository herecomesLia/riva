import type { InteractionLanguage } from "@/types/language"

export type PracticeQuestionType =
  "projectDeepDive" | "behavioral" | "businessUnderstanding" | "motivation" | "technicalFoundation"

export type PracticeFollowUpTemplateId = string

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

export type PracticeQuestionSourceAvailability = {
  targetRoleId: string
  questionType: PracticeQuestionType
  difficulty: PracticeDifficulty
  savedQuestionCount: number
  historyQuestionCount: number
}

export type PracticeReferenceAnswerKind = "personalizedExample" | "technicalReference"

export type PracticeReferenceAnswer = {
  kind: PracticeReferenceAnswerKind
  answer: string
  keyPoints: string[]
  commonMistakes: string[]
  generatedAt: string
}

export type PracticeReferenceAnswerState =
  | { status: "notRequested"; content: null; viewedBeforeSubmission: false }
  | { status: "generating"; content: null; viewedBeforeSubmission: false }
  | {
      status: "revealed"
      content: PracticeReferenceAnswer
      viewedBeforeSubmission: boolean
    }
  | { status: "unavailable"; content: null; viewedBeforeSubmission: false }

export type PracticeSetupContext = {
  targetRoles: PracticeTargetRoleOption[]
  defaultTargetRoleId: string | null
  availableDifficulties: PracticeDifficulty[]
  canPrioritizeWeaknesses: boolean
  eligibleQuestionCounts: {
    saved: number
    history: number
  }
  questionSourceAvailability: PracticeQuestionSourceAvailability[]
}

export type PracticeRecommendedMaterial = {
  type: "projectExperience" | "workExperience"
  id: string
  label: string
  reason: string
}

export type PracticeQuestionCard = {
  id: string
  prompt: string
  questionType: PracticeQuestionType
  difficulty: PracticeDifficulty
  assessedCapabilities: string[]
  recommendedMaterials: PracticeRecommendedMaterial[]
  answerHints: PracticeGuidance<string[]>
  answerFramework: PracticeGuidance<string[]>
  referenceAnswer: PracticeReferenceAnswerState
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

export type PracticeFollowUpReferenceAnswerKind = "personalizedSupplement" | "technicalReference"

export type PracticeFollowUpReferenceAnswer = {
  kind: PracticeFollowUpReferenceAnswerKind
  addressedGap: string
  answer: string
  keyPoints: string[]
  commonMistakes: string[]
  generatedAt: string
}

export type PracticeFollowUpReferenceAnswerState =
  | { status: "notRequested"; content: null; viewedBeforeSubmission: false }
  | { status: "generating"; content: null; viewedBeforeSubmission: false }
  | {
      status: "revealed"
      content: PracticeFollowUpReferenceAnswer
      viewedBeforeSubmission: boolean
    }
  | { status: "unavailable"; content: null; viewedBeforeSubmission: false }

export type PracticeFollowUpQuestion = {
  id: string
  /** Mock-only catalog metadata. The real API does not expose this field. */
  templateId?: PracticeFollowUpTemplateId
  prompt: string
  createdAt: string
  order: number
  answerHints: PracticeGuidance<string[]>
  answerFramework: PracticeGuidance<string[]>
  referenceAnswer: PracticeFollowUpReferenceAnswerState
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

export type PracticeAttemptRecord = {
  attemptId: string
  attemptNumber: number
  completedAt: string
  selection: ActivePracticeSelection
  question: PracticeQuestionCard
  mainAnswer: PracticeAnswer
  followUpExchanges: AnsweredPracticeFollowUpExchange[]
  followUpCompletion: PracticeFollowUpCompletion
  evaluation: PracticeEvaluation
  review: PracticeReview
}

export type UnfinishedPracticeAttempt = {
  attemptId: string
  attemptNumber: number
  selection: ActivePracticeSelection
  question: PracticeQuestionCard
}

type PracticeActiveSessionBase = {
  sessionId: string
  language: InteractionLanguage
  /** Positive integer incremented by persisted session state changes. */
  version: number
  selection: ActivePracticeSelection
  startedAt: string
  attemptId: string
  attemptNumber: number
  /** Completed attempts in this session; the active attempt is added after evaluation. */
  attemptRecords: PracticeAttemptRecord[]
}

type PracticeQuestionSessionBase = PracticeActiveSessionBase & {
  question: PracticeQuestionCard
}

type PracticeSubmittedAnswerRecord = PracticeQuestionSessionBase & {
  mainAnswer: PracticeAnswer
  followUpExchanges: AnsweredPracticeFollowUpExchange[]
  followUpCompletion: PracticeFollowUpCompletion
}

export type PracticeFollowUpCompletion =
  | {
      status: "completed"
      reason: "noFollowUpRequired" | "allAnswered"
    }
  | {
      status: "endedEarly"
      unansweredQuestion: PracticeFollowUpQuestion
    }

export type PracticeSetupState = {
  status: "setup"
  selection: PracticeSetupSelection
}

export type PracticeGeneratingQuestionState = PracticeActiveSessionBase & {
  status: "generatingQuestion"
  previousAttempt: PracticeAttemptRecord | null
}

export type PracticeAnsweringState = PracticeQuestionSessionBase & {
  status: "answering"
}

export type PracticeGeneratingFollowUpState = PracticeQuestionSessionBase & {
  status: "generatingFollowUp"
  mainAnswer: PracticeAnswer
  followUpExchanges: AnsweredPracticeFollowUpExchange[]
}

export type PracticeActiveSessionState =
  | PracticeGeneratingQuestionState
  | PracticeAnsweringState
  | PracticeGeneratingFollowUpState
  | PracticeAnsweringFollowUpState
  | PracticeEvaluatingState
  | PracticeReviewState

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

type PracticeCompletedSessionBase = PracticeActiveSessionBase & {
  status: "completed"
  completedAt: string
  questionsCompleted: number
  retryCount: number
  savedQuestionCount: number
  markedWeakQuestionCount: number
  finalAttemptAverageScore: number
}

export type PracticeCompletedReviewState = PracticeCompletedSessionBase & {
  completionReason: "reviewCompleted"
  nextStepSuggestion: string
  unfinishedAttempt: null
}

export type PracticeCompletedEarlyState = PracticeCompletedSessionBase & {
  completionReason: "userEndedEarly"
  nextStepSuggestion: string | null
  unfinishedAttempt: UnfinishedPracticeAttempt
}

export type PracticeCompletedState = PracticeCompletedReviewState | PracticeCompletedEarlyState

export type PracticeSessionState =
  | PracticeSetupState
  | PracticeGeneratingQuestionState
  | PracticeAnsweringState
  | PracticeGeneratingFollowUpState
  | PracticeAnsweringFollowUpState
  | PracticeEvaluatingState
  | PracticeReviewState
  | PracticeCompletedState

export type PracticePageResponse = {
  setupContext: PracticeSetupContext
  session: PracticeSessionState
}

/** Mock service mutations continue to expose the complete page snapshot. */
export type PracticeMutationResponse = PracticePageResponse

/** Real mutations and polling may return a session without setup context. */
export type PracticeServiceResponse =
  PracticePageResponse | PracticeActiveSessionState | PracticeCompletedState

export type StartPracticeSessionInput = ActivePracticeSelection

export type GetQuestionGenerationStatusInput = {
  sessionId: string
  version: number
}

export type GetFollowUpGenerationStatusInput = {
  sessionId: string
  version: number
}

export type GetPracticeEvaluationStatusInput = {
  sessionId: string
  version: number
  questionId: string
}

export type GetPracticeReferenceAnswerStatusInput = PracticeQuestionMutationInput

export type GetPracticeFollowUpReferenceAnswerStatusInput = PracticeFollowUpMutationInput

export type RetryPracticeEvaluationInput = GetPracticeEvaluationStatusInput

export type PracticeQuestionMutationInput = {
  sessionId: string
  version: number
  questionId: string
}

export type PracticeFollowUpMutationInput = PracticeQuestionMutationInput & {
  followUpQuestionId: string
}

export type SubmitPrimaryAnswerInput = PracticeQuestionMutationInput & {
  content: string
}

export type SubmitFollowUpAnswerInput = PracticeFollowUpMutationInput & {
  content: string
}

export type EndPracticeFollowUpsInput = PracticeFollowUpMutationInput

export type RequestPracticeFollowUpHintInput = PracticeFollowUpMutationInput

export type RequestPracticeFollowUpFrameworkInput = PracticeFollowUpMutationInput

export type RequestPracticeFollowUpReferenceAnswerInput = PracticeFollowUpMutationInput

export type SetPracticeQuestionSavedInput = PracticeQuestionMutationInput & {
  isSaved: boolean
}

export type SetPracticeQuestionWeakInput = PracticeQuestionMutationInput & {
  isMarkedWeak: boolean
}

export type PracticeQuestionFlagMutationInput =
  SetPracticeQuestionSavedInput | SetPracticeQuestionWeakInput

export type RequestPracticeHintInput = PracticeQuestionMutationInput

export type RequestAnswerFrameworkInput = PracticeQuestionMutationInput

export type RequestPracticeReferenceAnswerInput = PracticeQuestionMutationInput

export type SkipPracticeQuestionInput = PracticeQuestionMutationInput

export type RequestEndPracticeSessionInput = PracticeQuestionMutationInput

export type RetryCurrentPracticeQuestionInput = PracticeQuestionMutationInput

export type ContinueToNextPracticeQuestionInput = PracticeQuestionMutationInput

export type EndPracticeSessionInput = {
  sessionId: string
  version: number
}

export type PrepareNextPracticeSessionInput = {
  sessionId: string
  version: number
}
