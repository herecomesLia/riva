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
import type { TargetRoleStatus } from "./roles"

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

export type TrainingEntryAdjustmentReason =
  | "practiceQuestionTypeUnsupported"
  | "interviewRoundUnsupported"
  | "difficultyUnavailable"
  | "durationUnavailable"

export type TrainingEntryRoleUnavailableReason =
  "targetRoleDeleted" | "targetRoleArchived" | "targetRolePrerequisiteUnavailable"

export type TrainingEntryRoleAvailability =
  | { status: "available" }
  | {
      status: "unavailable"
      reason: TrainingEntryRoleUnavailableReason
    }

export type TrainingEntryResolution<TConfiguration> =
  | {
      status: "available"
      configuration: TConfiguration
      adjustments: []
    }
  | {
      status: "adjusted"
      configuration: TConfiguration
      adjustments: [TrainingEntryAdjustmentReason, ...TrainingEntryAdjustmentReason[]]
    }
  | {
      status: "roleUnavailable"
      configuration: TConfiguration
      reason: TrainingEntryRoleUnavailableReason
    }

export type PracticeTrainingEntryResolution = TrainingEntryResolution<PracticeSetupSelection>

export type InterviewTrainingEntryResolution = TrainingEntryResolution<
  InterviewSetupResponse["defaultConfiguration"]
>

export type PracticeTrainingEntryPreparationResponse = {
  page: import("./practice").PracticePageResponse
  resolution: PracticeTrainingEntryResolution
}

export type InterviewTrainingEntryPreparationResponse = {
  page: import("./interview").InterviewPageResponse
  resolution: InterviewTrainingEntryResolution
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

export function tryToPracticeQuestionType(questionType: unknown): PracticeQuestionType | undefined {
  return typeof questionType === "string" &&
    Object.hasOwn(practiceTypeByTrainingRecordType, questionType)
    ? practiceTypeByTrainingRecordType[questionType as TrainingRecordQuestionType]
    : undefined
}

export function toPracticeQuestionType(
  questionType: TrainingRecordQuestionType,
): PracticeQuestionType {
  return practiceTypeByTrainingRecordType[questionType]
}

export function resolveTrainingEntryRoleAvailability(
  roles: Array<{ id: string; status: TargetRoleStatus }>,
  trainableRoleIds: readonly string[],
  requestedRoleId: string | undefined,
  prerequisitesAvailable = true,
): TrainingEntryRoleAvailability {
  const role = roles.find(({ id }) => id === requestedRoleId)
  if (!role) return { status: "unavailable", reason: "targetRoleDeleted" }
  if (role.status === "archived") {
    return { status: "unavailable", reason: "targetRoleArchived" }
  }
  if (!prerequisitesAvailable || !trainableRoleIds.includes(role.id)) {
    return { status: "unavailable", reason: "targetRolePrerequisiteUnavailable" }
  }
  return { status: "available" }
}

export function resolvePracticeTrainingEntry(
  context: PracticeSetupContext,
  current: PracticeSetupSelection,
  parameters: PracticeTrainingEntryParameters,
  roleAvailability: TrainingEntryRoleAvailability,
): PracticeTrainingEntryResolution {
  if (roleAvailability.status === "unavailable") {
    return {
      status: "roleUnavailable",
      reason: roleAvailability.reason,
      configuration: {
        ...current,
        targetRoleId: null,
        questionType: parameters.questionType ?? current.questionType,
        difficulty: context.availableDifficulties.includes(
          parameters.difficulty ?? current.difficulty,
        )
          ? (parameters.difficulty ?? current.difficulty)
          : context.availableDifficulties[0],
        source: parameters.source ?? current.source,
        prioritizeWeaknesses: parameters.prioritizeWeaknesses ?? current.prioritizeWeaknesses,
      },
    }
  }

  const selectedRole = context.targetRoles.find(({ id }) => id === parameters.targetRoleId)
  if (!selectedRole) {
    throw new Error("Available history target role is missing from practice setup.")
  }
  const adjustments: TrainingEntryAdjustmentReason[] = []
  const requestedQuestionType = parameters.questionType ?? current.questionType
  const questionType = selectedRole.supportedQuestionTypes.includes(requestedQuestionType)
    ? requestedQuestionType
    : selectedRole.supportedQuestionTypes[0]
  if (!questionType) throw new Error("Practice target role has no supported question type.")
  if (questionType !== requestedQuestionType) {
    adjustments.push("practiceQuestionTypeUnsupported")
  }
  const requestedDifficulty = parameters.difficulty ?? current.difficulty
  const difficulty = context.availableDifficulties.includes(requestedDifficulty)
    ? requestedDifficulty
    : context.availableDifficulties[0]
  if (!difficulty) throw new Error("Practice setup has no available difficulty.")
  if (difficulty !== requestedDifficulty) adjustments.push("difficultyUnavailable")

  const configuration = {
    targetRoleId: selectedRole.id,
    questionType,
    difficulty,
    source: parameters.source ?? current.source,
    prioritizeWeaknesses: parameters.prioritizeWeaknesses ?? current.prioritizeWeaknesses,
  }

  return adjustments.length === 0
    ? { status: "available", configuration, adjustments: [] }
    : {
        status: "adjusted",
        configuration,
        adjustments: adjustments as [
          TrainingEntryAdjustmentReason,
          ...TrainingEntryAdjustmentReason[],
        ],
      }
}

export function resolveInterviewTrainingEntry(
  setup: InterviewSetupResponse,
  parameters: InterviewTrainingEntryParameters,
  roleAvailability: TrainingEntryRoleAvailability,
): InterviewTrainingEntryResolution {
  if (roleAvailability.status === "unavailable") {
    return {
      status: "roleUnavailable",
      reason: roleAvailability.reason,
      configuration: {
        targetRoleId: null,
        round: parameters.round ?? setup.defaultConfiguration.round,
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
      },
    }
  }

  const selectedRole = setup.targetRoles.find(({ id }) => id === parameters.targetRoleId)
  if (!selectedRole) {
    throw new Error("Available history target role is missing from interview setup.")
  }
  const adjustments: TrainingEntryAdjustmentReason[] = []
  const requestedRound = parameters.round ?? setup.defaultConfiguration.round
  const round = selectedRole.supportedRounds.includes(requestedRound)
    ? requestedRound
    : selectedRole.supportedRounds[0]
  if (round !== requestedRound) adjustments.push("interviewRoundUnsupported")
  const requestedDifficulty = parameters.difficulty ?? setup.defaultConfiguration.difficulty
  const difficulty = setup.availableDifficulties.includes(requestedDifficulty)
    ? requestedDifficulty
    : setup.availableDifficulties[0]
  if (difficulty !== requestedDifficulty) adjustments.push("difficultyUnavailable")
  const requestedDuration = parameters.durationMinutes ?? setup.defaultConfiguration.durationMinutes
  const durationMinutes = setup.availableDurationMinutes.includes(requestedDuration)
    ? requestedDuration
    : setup.availableDurationMinutes[0]
  if (durationMinutes !== requestedDuration) adjustments.push("durationUnavailable")

  const configuration = {
    targetRoleId: selectedRole.id,
    round,
    difficulty,
    durationMinutes,
  }

  return adjustments.length === 0
    ? { status: "available", configuration, adjustments: [] }
    : {
        status: "adjusted",
        configuration,
        adjustments: adjustments as [
          TrainingEntryAdjustmentReason,
          ...TrainingEntryAdjustmentReason[],
        ],
      }
}
