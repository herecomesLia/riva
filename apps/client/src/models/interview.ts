import type { InteractionLanguage } from "@/types/language"

export type InterviewRound =
  "hr" | "firstBusiness" | "technical" | "manager" | "final" | "comprehensive"

export type InterviewDifficulty = "basic" | "pressure"

export type InterviewDurationMinutes = 15 | 30 | 45

export type InterviewQuestionType =
  | "selfIntroduction"
  | "projectDeepDive"
  | "roleCapability"
  | "behavioral"
  | "technicalOrBusiness"
  | "resumeRisk"
  | "motivation"

export type InterviewConfiguration = {
  targetRoleId: string
  round: InterviewRound
  difficulty: InterviewDifficulty
  /** User preference only. The Agent decides question count and follow-up depth. */
  durationMinutes: InterviewDurationMinutes
}

/**
 * Server response models.
 *
 * These types describe persisted business data only. Display labels and i18n
 * keys belong to the page layer and must not be added to this contract.
 */
export type InterviewTargetRoleResponse = {
  id: string
  title: string
  company: string | null
  supportedRounds: [InterviewRound, ...InterviewRound[]]
}

export type InterviewSetupAvailabilityResponse =
  | { status: "available" }
  | {
      status: "blocked"
      reason: "profileIncomplete" | "jobDescriptionMissing"
    }

export type InterviewSetupResponse = {
  availability: InterviewSetupAvailabilityResponse
  targetRoles: InterviewTargetRoleResponse[]
  availableDifficulties: [InterviewDifficulty, ...InterviewDifficulty[]]
  availableDurationMinutes: [InterviewDurationMinutes, ...InterviewDurationMinutes[]]
  defaultConfiguration: {
    targetRoleId: string | null
    round: InterviewRound
    difficulty: InterviewDifficulty
    durationMinutes: InterviewDurationMinutes
  }
}

export type InterviewQuestionResponse = {
  id: string
  prompt: string
  type: InterviewQuestionType
  assessedCapabilities: string[]
  order: number
}

export type InterviewAnswerResponse = {
  id: string
  content: string
  submittedAt: string
}

export type InterviewFollowUpQuestionResponse = {
  id: string
  parentQuestionId: string
  prompt: string
  order: number
  createdAt: string
}

export type AnsweredInterviewFollowUpResponse = {
  status: "answered"
  question: InterviewFollowUpQuestionResponse
  answer: InterviewAnswerResponse
}

export type UnansweredInterviewFollowUpResponse = {
  status: "unanswered"
  question: InterviewFollowUpQuestionResponse
  answer: null
}

export type InterviewFollowUpRecordResponse =
  AnsweredInterviewFollowUpResponse | UnansweredInterviewFollowUpResponse

export type CompletedInterviewQuestionResponse = {
  question: InterviewQuestionResponse
  answer: InterviewAnswerResponse
  followUps: AnsweredInterviewFollowUpResponse[]
  completedAt: string
}

export type InterviewQuestionRecordResponse =
  | {
      status: "answered"
      question: InterviewQuestionResponse
      answer: InterviewAnswerResponse
      followUps: InterviewFollowUpRecordResponse[]
    }
  | {
      status: "unanswered"
      question: InterviewQuestionResponse
      answer: null
      followUps: []
    }

export type InterviewCandidateQuestionResponse = {
  id: string
  content: string
  submittedAt: string
}

export type InterviewCandidateQuestionFeedbackResponse = {
  summary: string
  strengths: string[]
  improvementSuggestions: string[]
  suggestedAlternatives: string[]
}

export type InterviewCandidateQuestionExchangeResponse = {
  question: InterviewCandidateQuestionResponse
  interviewerAnswer: string
  feedback: InterviewCandidateQuestionFeedbackResponse
}

export type InterviewProgressResponse = {
  completedMainQuestions: number
  /** `null` means the Agent has not committed to a stable main-question count. */
  totalMainQuestions: number | null
  /** Increments when the Agent changes the active interview plan. */
  planRevision: number
}

type InterviewActiveSessionResponseBase = {
  sessionId: string
  language: InteractionLanguage
  /** Positive integer incremented by each persisted session mutation. */
  version: number
  configuration: InterviewConfiguration
  startedAt: string
  progress: InterviewProgressResponse
  completedQuestions: CompletedInterviewQuestionResponse[]
}

export type InterviewOpeningSessionResponse = InterviewActiveSessionResponseBase & {
  status: "opening"
  openingMessage: string
}

export type InterviewQuestionSessionResponse = InterviewActiveSessionResponseBase & {
  status: "question"
  currentQuestion: {
    status: "awaitingAnswer"
    question: InterviewQuestionResponse
    answer: null
  }
}

export type InterviewFollowUpSessionResponse = InterviewActiveSessionResponseBase & {
  status: "followUp"
  currentQuestion: {
    question: InterviewQuestionResponse
    answer: InterviewAnswerResponse
    answeredFollowUps: AnsweredInterviewFollowUpResponse[]
  }
  currentFollowUp: {
    status: "awaitingAnswer"
    question: InterviewFollowUpQuestionResponse
    answer: null
  }
}

export type InterviewCandidateQuestionsSessionResponse = InterviewActiveSessionResponseBase & {
  status: "candidateQuestions"
  prompt: string
  exchanges: InterviewCandidateQuestionExchangeResponse[]
}

export type InterviewScoreDimension =
  | "relevance"
  | "structure"
  | "specificity"
  | "personalContribution"
  | "resultsAndEvidence"
  | "roleAlignment"
  | "communication"
  | "riskControl"

export type InterviewDimensionScoreResponse = {
  dimension: InterviewScoreDimension
  /** Whole-number score from 0 to 100. */
  score: number
  explanation: string
}

export type InterviewQuestionReviewResponse = {
  questionId: string
  /** Whole-number score from 0 to 100. */
  score: number
  summary: string
  strengths: string[]
  issues: string[]
}

export type InterviewReferenceAnswerContentResponse = {
  recommendedStructure: string[]
  keyPoints: string[]
  exampleAnswer: string
  usageGuidance: string
  generatedAt: string
}

export type InterviewReferenceAnswerResponse =
  | {
      status: "ready"
      content: InterviewReferenceAnswerContentResponse
    }
  | {
      status: "generating"
    }
  | {
      status: "unavailable"
      reason: "generationFailed"
    }

export type InterviewFollowUpReviewResponse = {
  followUpQuestionId: string
  /** Whole-number score from 0 to 100. */
  score: number
  summary: string
  strengths: string[]
  issues: string[]
}

export type InterviewFollowUpLearningDetailResponse = {
  record: InterviewFollowUpRecordResponse
  performance: InterviewFollowUpReviewResponse | null
  referenceAnswer: InterviewReferenceAnswerResponse
}

export type InterviewQuestionLearningDetailResponse = {
  record: InterviewQuestionRecordResponse
  performance: InterviewQuestionReviewResponse | null
  referenceAnswer: InterviewReferenceAnswerResponse
  followUps: InterviewFollowUpLearningDetailResponse[]
}

export type InterviewTrainingSuggestionResponse =
  | {
      action: "targetedPractice"
      reason: string
      focusAreas: string[]
      questionType: InterviewQuestionType
      difficulty: InterviewDifficulty
    }
  | {
      action: "mockInterview"
      reason: string
      focusAreas: string[]
      round: InterviewRound
      difficulty: InterviewDifficulty
    }

type InterviewReviewNarrativeResponse = {
  overallPerformance: string
  questionReviews: InterviewQuestionReviewResponse[]
  mainStrengths: string[]
  frequentIssues: string[]
  exposedWeaknesses: string[]
  riskPoints: string[]
  communicationSuggestions: string[]
  preparationSuggestions: string[]
  generatedAt: string
}

export type InterviewPartialReviewResponse = InterviewReviewNarrativeResponse

export type InterviewReviewResponse = InterviewReviewNarrativeResponse & {
  /** Whole-number score from 0 to 100. */
  overallScore: number
  dimensionScores: InterviewDimensionScoreResponse[]
  nextTraining: InterviewTrainingSuggestionResponse
}

export type InterviewCompletionReason = "formalQuestionsCompleted" | "userEndedEarly"

export type InterviewSessionReviewResponse =
  | {
      status: "unavailable"
      reason: "insufficientAnswers"
    }
  | {
      status: "partial"
      review: InterviewPartialReviewResponse
    }
  | {
      status: "complete"
      review: InterviewReviewResponse
    }

export type InterviewCompletedSessionResponse = InterviewActiveSessionResponseBase & {
  status: "completed"
  completionReason: InterviewCompletionReason
  completedAt: string
  candidateQuestionExchanges: InterviewCandidateQuestionExchangeResponse[]
  review: InterviewSessionReviewResponse
  /** Persisted learning snapshot for every question actually shown to the user. */
  questionDetails: InterviewQuestionLearningDetailResponse[]
}

export type ActiveInterviewSessionResponse =
  | InterviewOpeningSessionResponse
  | InterviewQuestionSessionResponse
  | InterviewFollowUpSessionResponse
  | InterviewCandidateQuestionsSessionResponse

export type InterviewSessionResponse =
  ActiveInterviewSessionResponse | InterviewCompletedSessionResponse

export type InterviewPageResponse = {
  setup: InterviewSetupResponse
  /** `null` means the user has not started an interview. */
  session: InterviewSessionResponse | null
}

/**
 * Page display models.
 *
 * Request lifecycle and empty-data handling are client concerns, so they stay
 * outside the server response contract.
 */
export type InterviewSetupViewData = {
  availability: InterviewSetupResponse["availability"]
  targetRoles: InterviewTargetRoleResponse[]
  availableDifficulties: InterviewSetupResponse["availableDifficulties"]
  availableDurationMinutes: InterviewSetupResponse["availableDurationMinutes"]
  defaultConfiguration: InterviewSetupResponse["defaultConfiguration"]
}

export type InterviewConversationRecordViewData = {
  id: string
  kind: "question" | "followUp"
  questionOrder: number
  prompt: string
  answer: string
}

export type InterviewPageViewState =
  | {
      status: "loading"
    }
  | {
      status: "empty"
      reason: "noTargetRoles"
    }
  | {
      status: "failed"
      reason: "loadFailed"
      isRetrying: boolean
    }
  | {
      status: "ready"
      setup: InterviewSetupViewData
      session: ActiveInterviewSessionResponse | null
    }
  | {
      status: "completed"
      setup: InterviewSetupViewData
      session: InterviewCompletedSessionResponse
    }

/**
 * Form models.
 *
 * Form fields intentionally allow incomplete values. Validated mutation inputs
 * below use the stricter business contract.
 */
export type InterviewSetupField = "targetRoleId" | "round" | "difficulty" | "durationMinutes"

export type InterviewSetupFormState = {
  values: {
    targetRoleId: string | null
    round: InterviewRound | null
    difficulty: InterviewDifficulty | null
    durationMinutes: InterviewDurationMinutes | null
  }
  fieldErrors: Partial<Record<InterviewSetupField, "required">>
  submitStatus: "idle" | "submitting" | "failed"
}

export type InterviewAnswerFormState = {
  content: string
  validationError: "required" | null
  submitStatus: "idle" | "submitting" | "failed"
}

export type InterviewCandidateQuestionFormState = {
  content: string
  validationError: "required" | null
  submitStatus: "idle" | "submitting" | "failed"
}

/**
 * Service inputs.
 *
 * Successful mutations return a complete authoritative page snapshot.
 */
export type InterviewMutationResponse = InterviewPageResponse

export type StartInterviewInput = InterviewConfiguration

export type InterviewSessionMutationInput = {
  sessionId: string
  version: number
}

export type BeginInterviewQuestionsInput = InterviewSessionMutationInput

export type SubmitInterviewAnswerInput =
  | (InterviewSessionMutationInput & {
      target: "question"
      questionId: string
      content: string
    })
  | (InterviewSessionMutationInput & {
      target: "followUp"
      questionId: string
      followUpQuestionId: string
      content: string
    })

export type SubmitCandidateQuestionInput = InterviewSessionMutationInput & {
  content: string
}

export type FinishInterviewInput = InterviewSessionMutationInput

export type EndInterviewInput = InterviewSessionMutationInput

export type GetInterviewReviewInput = {
  sessionId: string
}

type GetInterviewReviewResponseBase = {
  sessionId: string
  completionReason: InterviewCompletionReason
  questionDetails: InterviewQuestionLearningDetailResponse[]
}

export type GetInterviewReviewResponse = GetInterviewReviewResponseBase &
  (
    | {
        status: "unavailable"
        reason: "insufficientAnswers"
      }
    | {
        status: "partial"
        review: InterviewPartialReviewResponse
      }
    | {
        status: "complete"
        review: InterviewReviewResponse
      }
  )
