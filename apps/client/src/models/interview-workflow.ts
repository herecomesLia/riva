export type InterviewRound =
  "hr" | "firstBusiness" | "technical" | "manager" | "final" | "comprehensive"

export type InterviewDifficulty = "basic" | "pressure"

export type InterviewDurationMinutes = 15 | 30 | 45

export type InterviewConfiguration = {
  targetRoleId: string
  round: InterviewRound
  difficulty: InterviewDifficulty
  durationMinutes: InterviewDurationMinutes
}

export type InterviewRoleOption = {
  id: string
  title: string
  company: string | null
  supportedRounds: InterviewRound[]
}

export type InterviewAvailability =
  | { status: "available" }
  | {
      status: "blocked"
      reason: "profileIncomplete" | "jobDescriptionMissing"
    }

export type InterviewSetup = {
  availability: InterviewAvailability
  targetRoles: InterviewRoleOption[]
  availableDifficulties: InterviewDifficulty[]
  availableDurationMinutes: InterviewDurationMinutes[]
  defaultConfiguration: Omit<InterviewConfiguration, "targetRoleId"> & {
    targetRoleId: string | null
  }
}

export type InterviewProgress = {
  completedMainQuestions: number
  totalMainQuestions: number | null
  planAdjusted: boolean
}

export type InterviewPrompt = {
  kind: "question" | "followUp"
  content: string
  questionOrder: number
}

export type InterviewConversationItem = {
  kind: "question" | "followUp"
  questionOrder: number
  prompt: string
  answer: string
}

type InterviewSessionBase = {
  sessionId: string
  configuration: InterviewConfiguration
  progress: InterviewProgress
}

export type OpeningSession = InterviewSessionBase & {
  status: "opening"
  openingMessage: string
}

export type QuestionSession = InterviewSessionBase & {
  status: "question"
  history: InterviewConversationItem[]
  prompt: InterviewPrompt
}

export type FollowUpSession = InterviewSessionBase & {
  status: "followUp"
  history: InterviewConversationItem[]
  prompt: InterviewPrompt
}

export type CandidateQuestionExchange = {
  question: string
  interviewerAnswer: string
  feedback: {
    summary: string
    suggestedAlternatives: string[]
  }
}

export type CandidateQuestionsSession = InterviewSessionBase & {
  status: "candidateQuestions"
  history: InterviewConversationItem[]
  prompt: string
  exchanges: CandidateQuestionExchange[]
}

export type CompletedSession = {
  status: "completed"
  sessionId: string
  history: InterviewConversationItem[]
}

export type InterviewSession =
  OpeningSession | QuestionSession | FollowUpSession | CandidateQuestionsSession | CompletedSession

export type InterviewReferenceAnswer =
  | {
      status: "ready"
      content: {
        recommendedStructure: string[]
        keyPoints: string[]
        exampleAnswer: string
        usageGuidance: string
      }
    }
  | { status: "generating" }
  | { status: "unavailable" }

export type InterviewPerformance = {
  score: number
  summary: string
  strengths: string[]
  issues: string[]
}

export type InterviewFollowUpDetail = {
  prompt: string
  answer: string | null
  performance: InterviewPerformance | null
  referenceAnswer: InterviewReferenceAnswer
}

export type InterviewQuestionDetail = {
  questionOrder: number
  prompt: string
  answer: string | null
  performance: InterviewPerformance | null
  referenceAnswer: InterviewReferenceAnswer
  followUps: InterviewFollowUpDetail[]
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

export type InterviewDimensionScore = {
  dimension: InterviewScoreDimension
  score: number
  explanation: string
}

export type InterviewReviewNarrative = {
  overallPerformance: string
  mainStrengths: string[]
  frequentIssues: string[]
  exposedWeaknesses: string[]
  riskPoints: string[]
  communicationSuggestions: string[]
  preparationSuggestions: string[]
}

export type InterviewTrainingSuggestion = {
  action: "targetedPractice" | "mockInterview"
  reason: string
  focusAreas: string[]
}

export type PartialInterviewReview = {
  status: "partial"
  review: InterviewReviewNarrative
  questionDetails: InterviewQuestionDetail[]
}

export type CompleteInterviewReview = {
  status: "complete"
  review: InterviewReviewNarrative & {
    overallScore: number
    dimensionScores: InterviewDimensionScore[]
    nextTraining: InterviewTrainingSuggestion
  }
  questionDetails: InterviewQuestionDetail[]
}

export type InterviewReview =
  | { status: "generating" }
  | { status: "failed" }
  | { status: "unavailable"; questionDetails: InterviewQuestionDetail[] }
  | PartialInterviewReview
  | CompleteInterviewReview
