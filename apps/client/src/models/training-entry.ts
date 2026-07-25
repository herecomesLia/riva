import type {
  InterviewDifficulty,
  InterviewDurationMinutes,
  InterviewRound,
  InterviewSetupResponse,
} from "./interview"
import type {
  PracticeDifficulty,
  PracticeQuestionSource,
  PracticeQuestionType,
  PracticeSetupContext,
  PracticeSetupSelection,
} from "./practice"
import type { TrainingRecordQuestionType } from "./training-records"

export type TrainingEntryOrigin = "history"

export type PracticeTrainingEntryParameters = {
  targetRoleId?: string
  questionType?: PracticeQuestionType
  difficulty?: PracticeDifficulty
  source?: PracticeQuestionSource
  prioritizeWeaknesses?: boolean
}

export type InterviewTrainingEntryParameters = {
  targetRoleId?: string
  round?: InterviewRound
  difficulty?: InterviewDifficulty
  durationMinutes?: InterviewDurationMinutes
}

const practiceTypeByTrainingRecordType = {
  selfIntroduction: "motivation",
  projectDeepDive: "projectDeepDive",
  roleCapability: "businessUnderstanding",
  behavioral: "behavioral",
  technicalOrBusiness: "technicalFoundation",
  businessUnderstanding: "businessUnderstanding",
  technicalFoundation: "technicalFoundation",
  resumeRisk: "behavioral",
  motivation: "motivation",
} satisfies Record<TrainingRecordQuestionType, PracticeQuestionType>

export function toPracticeQuestionType(
  questionType: TrainingRecordQuestionType,
): PracticeQuestionType {
  return practiceTypeByTrainingRecordType[questionType]
}

export function resolvePracticeTrainingEntry(
  context: PracticeSetupContext,
  current: PracticeSetupSelection,
  parameters: PracticeTrainingEntryParameters,
): PracticeSetupSelection {
  const requestedRole = context.targetRoles.find(({ id }) => id === parameters.targetRoleId)
  const fallbackRole = context.targetRoles.find(({ id }) => id === context.defaultTargetRoleId)
  const selectedRole = requestedRole ?? fallbackRole
  const requestedQuestionType = parameters.questionType ?? current.questionType
  const questionType =
    selectedRole?.supportedQuestionTypes.includes(requestedQuestionType) === true
      ? requestedQuestionType
      : (selectedRole?.supportedQuestionTypes[0] ?? current.questionType)

  return {
    targetRoleId: selectedRole?.id ?? null,
    questionType,
    difficulty: parameters.difficulty ?? current.difficulty,
    source: parameters.source ?? current.source,
    prioritizeWeaknesses: parameters.prioritizeWeaknesses ?? current.prioritizeWeaknesses,
  }
}

export function resolveInterviewTrainingEntry(
  setup: InterviewSetupResponse,
  parameters: InterviewTrainingEntryParameters,
  fallbackTargetRoleId: string | null = setup.defaultConfiguration.targetRoleId,
): InterviewSetupResponse["defaultConfiguration"] {
  const requestedRole = setup.targetRoles.find(({ id }) => id === parameters.targetRoleId)
  const fallbackRole = setup.targetRoles.find(({ id }) => id === fallbackTargetRoleId)
  const selectedRole = requestedRole ?? fallbackRole
  const requestedRound = parameters.round ?? setup.defaultConfiguration.round

  return {
    targetRoleId: selectedRole?.id ?? null,
    round:
      selectedRole?.supportedRounds.includes(requestedRound) === true
        ? requestedRound
        : (selectedRole?.supportedRounds[0] ?? setup.defaultConfiguration.round),
    difficulty: setup.availableDifficulties.includes(
      parameters.difficulty ?? setup.defaultConfiguration.difficulty,
    )
      ? (parameters.difficulty ?? setup.defaultConfiguration.difficulty)
      : setup.availableDifficulties[0],
    durationMinutes: setup.availableDurationMinutes.includes(
      parameters.durationMinutes ?? setup.defaultConfiguration.durationMinutes,
    )
      ? (parameters.durationMinutes ?? setup.defaultConfiguration.durationMinutes)
      : setup.availableDurationMinutes[0],
  }
}
