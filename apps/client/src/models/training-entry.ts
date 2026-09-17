import type { PracticeDifficulty, PracticeQuestionType } from "@/api/generated/models"
import type {
  InterviewDifficulty,
  InterviewDurationMinutes,
  InterviewType,
  InterviewSetup,
} from "./interview-workflow"
import type { QuestionSource, PracticeSetupContext, PracticeSelection } from "./practice-workflow"
import type { TrainingRecordDifficulty, TrainingRecordQuestionType } from "./training-records"

export type TrainingEntryOrigin = "history"

export type PracticeTrainingEntryParameters = {
  roleId?: string
  questionType?: PracticeQuestionType
  difficulty?: PracticeDifficulty
  source?: QuestionSource
  prioritizeWeaknesses?: boolean
}

export type InterviewTrainingEntryParameters = {
  roleId?: string
  interviewType?: InterviewType
  difficulty?: InterviewDifficulty
  durationMinutes?: InterviewDurationMinutes
}

export type TrainingEntryAdjustmentReason =
  | "practiceQuestionTypeUnsupported"
  | "interviewTypeUnsupported"
  | "difficultyUnavailable"
  | "durationUnavailable"

export type TrainingEntryRoleUnavailableReason =
  "roleDeleted" | "roleArchived" | "rolePrerequisiteUnavailable"

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

export type PracticeTrainingEntryResolution = TrainingEntryResolution<PracticeSelection>

export type InterviewTrainingEntryResolution = TrainingEntryResolution<
  InterviewSetup["defaultConfiguration"]
>

export type PracticeTrainingEntryPreparationResponse = {
  page: import("./practice-workflow").PracticeData
  resolution: PracticeTrainingEntryResolution
}

export type InterviewTrainingEntryPreparationResponse = {
  page: import("./interview-workflow").InterviewData
  resolution: InterviewTrainingEntryResolution
}

const practiceTypeByTrainingRecordType = {
  selfIntroduction: "motivation",
  projectDeepDive: "project",
  roleCapability: "business_understanding",
  behavioral: "behavioral",
  technicalOrBusiness: "technical_basics",
  businessUnderstanding: "business_understanding",
  technicalFoundation: "technical_basics",
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

const practiceDifficultyByTrainingRecordDifficulty = {
  basic: "basic",
  pressure: "hard",
} satisfies Record<TrainingRecordDifficulty, PracticeDifficulty>

export function toPracticeDifficulty(difficulty: TrainingRecordDifficulty): PracticeDifficulty {
  return practiceDifficultyByTrainingRecordDifficulty[difficulty]
}

export function resolvePracticeTrainingEntry(
  context: PracticeSetupContext,
  current: PracticeSelection,
  parameters: PracticeTrainingEntryParameters,
  roleAvailability: TrainingEntryRoleAvailability,
): PracticeTrainingEntryResolution {
  if (roleAvailability.status === "unavailable") {
    return {
      status: "roleUnavailable",
      reason: roleAvailability.reason,
      configuration: {
        ...current,
        roleId: null,
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

  const selectedRole = context.roles.find(({ id }) => id === parameters.roleId)
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
    roleId: selectedRole.id,
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
  setup: InterviewSetup,
  parameters: InterviewTrainingEntryParameters,
  roleAvailability: TrainingEntryRoleAvailability,
): InterviewTrainingEntryResolution {
  if (roleAvailability.status === "unavailable") {
    return {
      status: "roleUnavailable",
      reason: roleAvailability.reason,
      configuration: {
        roleId: null,
        interviewType: parameters.interviewType ?? setup.defaultConfiguration.interviewType,
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

  const selectedRole = setup.roles.find(({ id }) => id === parameters.roleId)
  if (!selectedRole) {
    throw new Error("Available history target role is missing from interview setup.")
  }
  const adjustments: TrainingEntryAdjustmentReason[] = []
  const requestedInterviewType =
    parameters.interviewType ?? setup.defaultConfiguration.interviewType
  const interviewType = selectedRole.supportedInterviewTypes.includes(requestedInterviewType)
    ? requestedInterviewType
    : selectedRole.supportedInterviewTypes[0]
  if (interviewType !== requestedInterviewType) adjustments.push("interviewTypeUnsupported")
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
    roleId: selectedRole.id,
    interviewType,
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
