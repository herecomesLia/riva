import { z } from "zod"

import type { InterviewCompletedSessionResponse } from "@/models/interview"

export const INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY = "riva:mock:interview:completed-sessions"

const repositoryVersion = 1

const configurationSchema = z.object({
  targetRoleId: z.string().min(1),
  round: z.enum(["hr", "firstBusiness", "technical", "manager", "final", "comprehensive"]),
  difficulty: z.enum(["basic", "pressure"]),
  durationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45)]),
})

const questionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string(),
  type: z.enum([
    "selfIntroduction",
    "projectDeepDive",
    "roleCapability",
    "behavioral",
    "technicalOrBusiness",
    "resumeRisk",
    "motivation",
  ]),
  assessedCapabilities: z.array(z.string()),
  order: z.number().int().positive(),
})

const answerSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  submittedAt: z.string().min(1),
})

const followUpQuestionSchema = z.object({
  id: z.string().min(1),
  parentQuestionId: z.string().min(1),
  prompt: z.string(),
  order: z.number().int().positive(),
  createdAt: z.string().min(1),
})

const answeredFollowUpSchema = z.object({
  status: z.literal("answered"),
  question: followUpQuestionSchema,
  answer: answerSchema,
})

const unansweredFollowUpSchema = z.object({
  status: z.literal("unanswered"),
  question: followUpQuestionSchema,
  answer: z.null(),
})

const followUpRecordSchema = z.discriminatedUnion("status", [
  answeredFollowUpSchema,
  unansweredFollowUpSchema,
])

const completedQuestionSchema = z.object({
  question: questionSchema,
  answer: answerSchema,
  followUps: z.array(answeredFollowUpSchema),
  completedAt: z.string().min(1),
})

const questionRecordSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("answered"),
    question: questionSchema,
    answer: answerSchema,
    followUps: z.array(followUpRecordSchema),
  }),
  z.object({
    status: z.literal("unanswered"),
    question: questionSchema,
    answer: z.null(),
    followUps: z.tuple([]),
  }),
])

const candidateQuestionExchangeSchema = z.object({
  question: z.object({
    id: z.string().min(1),
    content: z.string(),
    submittedAt: z.string().min(1),
  }),
  interviewerAnswer: z.string(),
  feedback: z.object({
    summary: z.string(),
    strengths: z.array(z.string()),
    improvementSuggestions: z.array(z.string()),
    suggestedAlternatives: z.array(z.string()),
  }),
})

const questionReviewSchema = z.object({
  questionId: z.string().min(1),
  score: z.number().int().min(0).max(100),
  summary: z.string(),
  strengths: z.array(z.string()),
  issues: z.array(z.string()),
})

const referenceAnswerSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    content: z.object({
      recommendedStructure: z.array(z.string()),
      keyPoints: z.array(z.string()),
      exampleAnswer: z.string(),
      usageGuidance: z.string(),
      generatedAt: z.string().min(1),
    }),
  }),
  z.object({ status: z.literal("generating") }),
  z.object({
    status: z.literal("unavailable"),
    reason: z.literal("generationFailed"),
  }),
])

const followUpReviewSchema = z.object({
  followUpQuestionId: z.string().min(1),
  score: z.number().int().min(0).max(100),
  summary: z.string(),
  strengths: z.array(z.string()),
  issues: z.array(z.string()),
})

const questionDetailSchema = z.object({
  record: questionRecordSchema,
  performance: questionReviewSchema.nullable(),
  referenceAnswer: referenceAnswerSchema,
  followUps: z.array(
    z.object({
      record: followUpRecordSchema,
      performance: followUpReviewSchema.nullable(),
      referenceAnswer: referenceAnswerSchema,
    }),
  ),
})

const narrativeSchema = z.object({
  overallPerformance: z.string(),
  questionReviews: z.array(questionReviewSchema),
  mainStrengths: z.array(z.string()),
  frequentIssues: z.array(z.string()),
  exposedWeaknesses: z.array(z.string()),
  riskPoints: z.array(z.string()),
  communicationSuggestions: z.array(z.string()),
  preparationSuggestions: z.array(z.string()),
  generatedAt: z.string().min(1),
})

const completeReviewSchema = narrativeSchema.extend({
  overallScore: z.number().int().min(0).max(100),
  dimensionScores: z.array(
    z.object({
      dimension: z.enum([
        "relevance",
        "structure",
        "specificity",
        "personalContribution",
        "resultsAndEvidence",
        "roleAlignment",
        "communication",
        "riskControl",
      ]),
      score: z.number().int().min(0).max(100),
      explanation: z.string(),
    }),
  ),
  nextTraining: z.discriminatedUnion("action", [
    z.object({
      action: z.literal("targetedPractice"),
      reason: z.string(),
      focusAreas: z.array(z.string()),
      questionType: questionSchema.shape.type,
      difficulty: configurationSchema.shape.difficulty,
    }),
    z.object({
      action: z.literal("mockInterview"),
      reason: z.string(),
      focusAreas: z.array(z.string()),
      round: configurationSchema.shape.round,
      difficulty: configurationSchema.shape.difficulty,
    }),
  ]),
})

const sessionReviewSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("unavailable"),
    reason: z.literal("insufficientAnswers"),
  }),
  z.object({
    status: z.literal("partial"),
    review: narrativeSchema,
  }),
  z.object({
    status: z.literal("complete"),
    review: completeReviewSchema,
  }),
])

const completedSessionSchema = z.object({
  status: z.literal("completed"),
  sessionId: z.string().min(1),
  version: z.number().int().positive(),
  configuration: configurationSchema,
  startedAt: z.string().min(1),
  progress: z.object({
    completedMainQuestions: z.number().int().nonnegative(),
    totalMainQuestions: z.number().int().nonnegative().nullable(),
    planRevision: z.number().int().nonnegative(),
  }),
  completedQuestions: z.array(completedQuestionSchema),
  completionReason: z.enum(["formalQuestionsCompleted", "userEndedEarly"]),
  completedAt: z.string().min(1),
  candidateQuestionExchanges: z.array(candidateQuestionExchangeSchema),
  review: sessionReviewSchema,
  questionDetails: z.array(questionDetailSchema),
})

const repositorySchema = z.object({
  version: z.literal(repositoryVersion),
  sessions: z.array(completedSessionSchema),
})

type RepositoryState = {
  version: typeof repositoryVersion
  sessions: InterviewCompletedSessionResponse[]
}

let volatileState: RepositoryState = { version: repositoryVersion, sessions: [] }

function copy<T>(value: T): T {
  return structuredClone(value)
}

function getStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function emptyState(): RepositoryState {
  return { version: repositoryVersion, sessions: [] }
}

function readState(): RepositoryState {
  const storage = getStorage()
  if (storage === null) return copy(volatileState)

  let serialized: string | null
  try {
    serialized = storage.getItem(INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY)
  } catch {
    return copy(volatileState)
  }
  if (serialized === null) return emptyState()

  try {
    const parsed = repositorySchema.safeParse(JSON.parse(serialized))
    if (parsed.success) {
      return copy(parsed.data as RepositoryState)
    }
  } catch {
    // Invalid Mock storage is discarded below.
  }

  try {
    storage.removeItem(INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY)
  } catch {
    // Storage failures must not make the Mock page unavailable.
  }
  volatileState = emptyState()
  return emptyState()
}

function writeState(state: RepositoryState) {
  volatileState = copy(state)
  const storage = getStorage()
  if (storage === null) return
  try {
    storage.setItem(INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // The in-memory repository remains usable when browser storage is unavailable.
  }
}

export function saveCompletedInterviewSession(session: InterviewCompletedSessionResponse) {
  const snapshot = copy(session)
  const parsed = completedSessionSchema.safeParse(snapshot)
  if (!parsed.success) {
    throw new Error("Cannot persist an invalid completed interview session.")
  }
  const state = readState()
  const sessions = state.sessions.filter(({ sessionId }) => sessionId !== snapshot.sessionId)
  writeState({ version: repositoryVersion, sessions: [...sessions, snapshot] })
}

export function getCompletedInterviewSession(
  sessionId: string,
): InterviewCompletedSessionResponse | null {
  const session = readState().sessions.find((candidate) => candidate.sessionId === sessionId)
  return session === undefined ? null : copy(session)
}

export function listCompletedInterviewSessions(): InterviewCompletedSessionResponse[] {
  return copy(readState().sessions)
}

export function clearCompletedInterviewSessions() {
  volatileState = emptyState()
  const storage = getStorage()
  if (storage === null) return
  try {
    storage.removeItem(INTERVIEW_MOCK_REPOSITORY_STORAGE_KEY)
  } catch {
    // Storage failures must not make the Mock page unavailable.
  }
}
