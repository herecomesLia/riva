import type {
  PracticeQuestionSource,
  PracticeQuestionSourceAvailability,
  PracticeQuestionType,
  PracticeSetupContext,
  PracticeSetupSelection,
  PracticeTargetRoleOption,
} from "@/models/practice"
import { derivePracticeSupportedQuestionTypes } from "@/models/practice-role-support"
import type { RolesPageResponse, TargetRole } from "@/models/roles"

type PracticeEligibleQuestionCounts = PracticeSetupContext["eligibleQuestionCounts"]

type PracticeSetupContextOptions = {
  availability?: PracticeSetupContext["availability"]
  canPrioritizeWeaknesses?: boolean
  eligibleQuestionCounts?: PracticeEligibleQuestionCounts
  eligibleTargetRoleIds?: readonly string[]
  personalizedQuestionGenerationTargetRoleIds?: readonly string[]
  questionSourceAvailability?: PracticeQuestionSourceAvailability[]
}

function toPracticeRoleOption(role: TargetRole): PracticeTargetRoleOption {
  return {
    id: role.id,
    title: role.title,
    company: role.company,
    supportedQuestionTypes: derivePracticeSupportedQuestionTypes(role),
  }
}

export function buildPracticeSetupContext(
  rolesResponse: RolesPageResponse,
  options: PracticeSetupContextOptions = {},
): PracticeSetupContext {
  const nonArchivedRoles = rolesResponse.roles.filter(
    (role) => role.preparationStatus !== "archived",
  )
  const profileComplete =
    rolesResponse.profileContext.exists && rolesResponse.profileContext.completed
  const eligibleTargetRoleIds =
    options.eligibleTargetRoleIds ??
    (profileComplete
      ? nonArchivedRoles
          .filter(
            (role) =>
              role.jobDescription.status === "ready" && role.jobDescriptionAnalysis !== null,
          )
          .map(({ id }) => id)
      : [])
  const targetRoleModels = nonArchivedRoles.filter((role) =>
    eligibleTargetRoleIds.includes(role.id),
  )
  const targetRoles = targetRoleModels.map(toPracticeRoleOption)
  const defaultTargetRoleId = targetRoles.some((role) => role.id === rolesResponse.currentRoleId)
    ? rolesResponse.currentRoleId
    : null
  const availability =
    options.availability ??
    (nonArchivedRoles.length === 0
      ? { status: "blocked" as const, reason: "noTargetRoles" as const }
      : !profileComplete
        ? { status: "blocked" as const, reason: "profileIncomplete" as const }
        : targetRoles.length === 0
          ? { status: "blocked" as const, reason: "jobDescriptionMissing" as const }
          : { status: "available" as const })
  const personalizedQuestionGenerationTargetRoleIds =
    options.personalizedQuestionGenerationTargetRoleIds ??
    targetRoleModels
      .filter((role) => role.matchingAnalysis?.status === "current")
      .map(({ id }) => id)

  return {
    availability,
    targetRoles,
    defaultTargetRoleId,
    availableDifficulties: ["basic", "pressure"],
    canPrioritizeWeaknesses: options.canPrioritizeWeaknesses ?? false,
    personalizedQuestionGenerationTargetRoleIds: [...personalizedQuestionGenerationTargetRoleIds],
    eligibleQuestionCounts: options.eligibleQuestionCounts ?? { saved: 0, history: 0 },
    questionSourceAvailability: options.questionSourceAvailability ?? [],
  }
}

export function getEligiblePracticeQuestionCount(
  context: PracticeSetupContext,
  selection: Pick<
    PracticeSetupSelection,
    "targetRoleId" | "questionType" | "difficulty" | "source"
  >,
): number {
  if (selection.targetRoleId === null) return 0
  if (selection.source === "personalized") {
    return context.personalizedQuestionGenerationTargetRoleIds.includes(selection.targetRoleId)
      ? 1
      : 0
  }
  const availability = context.questionSourceAvailability.find(
    (candidate) =>
      candidate.targetRoleId === selection.targetRoleId &&
      candidate.questionType === selection.questionType &&
      candidate.difficulty === selection.difficulty,
  )
  return selection.source === "saved"
    ? (availability?.savedQuestionCount ?? 0)
    : (availability?.historyQuestionCount ?? 0)
}

export function createDefaultPracticeSelection(
  context: PracticeSetupContext,
): PracticeSetupSelection {
  const selectedRole =
    context.targetRoles.find((role) => role.id === context.defaultTargetRoleId) ??
    context.targetRoles[0]
  const defaultQuestionType: PracticeQuestionType = "projectDeepDive"
  const questionType = selectedRole?.supportedQuestionTypes.includes(defaultQuestionType)
    ? defaultQuestionType
    : (selectedRole?.supportedQuestionTypes[0] ?? defaultQuestionType)

  return {
    targetRoleId: selectedRole?.id ?? null,
    questionType,
    difficulty: "basic",
    source: "personalized",
    prioritizeWeaknesses: false,
  }
}

export function reconcilePracticeSetupSelection(
  context: PracticeSetupContext,
  selection: PracticeSetupSelection,
  options: { preserveUnavailableSource?: boolean } = {},
): PracticeSetupSelection {
  const existingRole = context.targetRoles.find((role) => role.id === selection.targetRoleId)
  const defaultRole = context.targetRoles.find((role) => role.id === context.defaultTargetRoleId)
  const selectedRole = existingRole ?? defaultRole ?? context.targetRoles[0]

  if (!selectedRole) {
    return {
      ...selection,
      targetRoleId: null,
      prioritizeWeaknesses: context.canPrioritizeWeaknesses
        ? selection.prioritizeWeaknesses
        : false,
    }
  }

  const questionType = selectedRole.supportedQuestionTypes.includes(selection.questionType)
    ? selection.questionType
    : (selectedRole.supportedQuestionTypes[0] ?? selection.questionType)
  const source: PracticeQuestionSource =
    options.preserveUnavailableSource ||
    getEligiblePracticeQuestionCount(context, {
      ...selection,
      targetRoleId: selectedRole.id,
      questionType,
    }) > 0
      ? selection.source
      : "personalized"

  return {
    ...selection,
    targetRoleId: selectedRole.id,
    questionType,
    source,
    prioritizeWeaknesses: context.canPrioritizeWeaknesses ? selection.prioritizeWeaknesses : false,
  }
}
