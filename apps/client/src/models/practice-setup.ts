import type {
  PracticeQuestionType,
  PracticeSetupContext,
  PracticeSetupSelection,
  PracticeTargetRoleOption,
} from "@/models/practice"
import { derivePracticeSupportedQuestionTypes } from "@/models/practice-role-support"
import type { RolesPageResponse, TargetRole } from "@/models/roles"

type PracticeEligibleQuestionCounts = PracticeSetupContext["eligibleQuestionCounts"]

type PracticeSetupContextOptions = {
  canPrioritizeWeaknesses?: boolean
  eligibleQuestionCounts?: PracticeEligibleQuestionCounts
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
  const targetRoles = rolesResponse.roles
    .filter((role) => role.preparationStatus !== "archived")
    .map(toPracticeRoleOption)
  const defaultTargetRoleId = targetRoles.some((role) => role.id === rolesResponse.currentRoleId)
    ? rolesResponse.currentRoleId
    : null

  return {
    targetRoles,
    defaultTargetRoleId,
    availableDifficulties: ["basic", "pressure"],
    canPrioritizeWeaknesses: options.canPrioritizeWeaknesses ?? false,
    eligibleQuestionCounts: options.eligibleQuestionCounts ?? { saved: 0, history: 0 },
  }
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

  return {
    ...selection,
    targetRoleId: selectedRole.id,
    questionType: selectedRole.supportedQuestionTypes.includes(selection.questionType)
      ? selection.questionType
      : (selectedRole.supportedQuestionTypes[0] ?? selection.questionType),
    prioritizeWeaknesses: context.canPrioritizeWeaknesses ? selection.prioritizeWeaknesses : false,
  }
}
