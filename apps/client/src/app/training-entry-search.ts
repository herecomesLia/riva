import { interviewTypes } from "@/models/interview-workflow"
import type { InterviewDifficulty, InterviewDurationMinutes } from "@/models/interview-workflow"
import type { Difficulty, QuestionSource, QuestionType } from "@/models/practice-workflow"
import type {
  InterviewTrainingEntryParameters,
  PracticeTrainingEntryParameters,
  TrainingEntryOrigin,
} from "@/models/training-entry"

const practiceQuestionTypes: QuestionType[] = [
  "projectDeepDive",
  "behavioral",
  "businessUnderstanding",
  "motivation",
  "technicalFoundation",
]
const practiceDifficulties: Difficulty[] = ["basic", "pressure"]
const practiceSources: QuestionSource[] = ["personalized", "saved", "history"]
const interviewDifficulties: InterviewDifficulty[] = ["basic", "pressure"]
const interviewDurations: InterviewDurationMinutes[] = [15, 30, 45]

export type PracticeEntrySearch = PracticeTrainingEntryParameters & {
  entry?: TrainingEntryOrigin
}

export type InterviewEntrySearch = InterviewTrainingEntryParameters & {
  entry?: TrainingEntryOrigin
}

export function parsePracticeEntrySearch(search: Record<string, unknown>): PracticeEntrySearch {
  return compact({
    entry: search.entry === "history" ? "history" : undefined,
    roleId: nonEmptyString(search.roleId),
    questionType: includes(practiceQuestionTypes, search.questionType)
      ? search.questionType
      : undefined,
    difficulty: includes(practiceDifficulties, search.difficulty) ? search.difficulty : undefined,
    source: includes(practiceSources, search.source) ? search.source : undefined,
    prioritizeWeaknesses: booleanValue(search.prioritizeWeaknesses),
  })
}

export function parseInterviewEntrySearch(search: Record<string, unknown>): InterviewEntrySearch {
  const duration = positiveInteger(search.durationMinutes)
  return compact({
    entry: search.entry === "history" ? "history" : undefined,
    roleId: nonEmptyString(search.roleId),
    interviewType: includes(interviewTypes, search.interviewType)
      ? search.interviewType
      : undefined,
    difficulty: includes(interviewDifficulties, search.difficulty) ? search.difficulty : undefined,
    durationMinutes:
      duration !== undefined && interviewDurations.includes(duration as InterviewDurationMinutes)
        ? (duration as InterviewDurationMinutes)
        : undefined,
  })
}

export function toPracticeEntryParameters(
  search: PracticeEntrySearch,
): PracticeTrainingEntryParameters {
  const { entry: _, ...parameters } = search
  return parameters
}

export function toInterviewEntryParameters(
  search: InterviewEntrySearch,
): InterviewTrainingEntryParameters {
  const { entry: _, ...parameters } = search
  return parameters
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T)
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function positiveInteger(value: unknown): number | undefined {
  const number = typeof value === "string" ? Number(value) : value
  return typeof number === "number" && Number.isInteger(number) && number > 0 ? number : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true
  if (value === false || value === "false") return false
  return undefined
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}
