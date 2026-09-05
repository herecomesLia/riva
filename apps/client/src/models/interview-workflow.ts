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

export type InterviewSession = OpeningSession | QuestionSession
