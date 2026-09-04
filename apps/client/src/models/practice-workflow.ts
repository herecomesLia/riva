export type QuestionType =
  "projectDeepDive" | "behavioral" | "businessUnderstanding" | "motivation" | "technicalFoundation"

export type Difficulty = "basic" | "pressure"

export type QuestionSource = "personalized" | "saved" | "history"

export type PracticeSelection = {
  targetRoleId: string | null
  questionType: QuestionType
  difficulty: Difficulty
  source: QuestionSource
  prioritizeWeaknesses: boolean
}

export type ActiveSelection = PracticeSelection & {
  targetRoleId: string
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
  id: string
  prompt: string
  questionType: QuestionType
  difficulty: Difficulty
  assessedCapabilities: string[]
  recommendedMaterials: string[]
  hints: Guidance<string[]>
  framework: Guidance<string[]>
  referenceAnswer: ReferenceAnswerState
  isSaved: boolean
  isWeak: boolean
}

export type SetupSession = {
  status: "setup"
  selection: PracticeSelection
}

export type GeneratingSession = {
  status: "generatingQuestion"
  sessionId: string
  selection: ActiveSelection
}

export type AnsweringSession = {
  status: "answering"
  sessionId: string
  selection: ActiveSelection
  question: PracticeQuestion
}

export type PracticeSession = SetupSession | GeneratingSession | AnsweringSession
