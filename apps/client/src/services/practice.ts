import { practiceFaker } from "@/mocks/fakers/practice"
import type { PracticeData, PracticeSetupContext, QuestionType } from "@/models/practice-workflow"
import { resolvePracticeTrainingEntry } from "@/models/training-entry"
import type {
  PracticeTrainingEntryParameters,
  PracticeTrainingEntryPreparationResponse,
  TrainingEntryRoleAvailability,
} from "@/models/training-entry"
import type { TargetRoleListResponse } from "@/api/generated/models"
import { getRoles } from "@/services/roles"

function setupContext(roles: TargetRoleListResponse["targetRoles"]): PracticeSetupContext {
  const supportedQuestionTypes: QuestionType[] = [
    "projectDeepDive",
    "behavioral",
    "businessUnderstanding",
    "motivation",
    "technicalFoundation",
  ]
  return {
    targetRoles: roles
      .filter((role) => !role.isArchived)
      .map(({ id, title, company }) => ({
        id,
        title,
        company,
        supportedQuestionTypes,
      })),
    availableDifficulties: ["basic", "pressure"],
    eligibleQuestionCounts: { saved: 1, history: 1 },
  }
}

export async function getPracticePage(): Promise<PracticeData> {
  const [roles, session] = await Promise.all([getRoles(), practiceFaker.get()])
  const context = setupContext(roles.targetRoles)
  if (session.status === "setup") {
    const available = (id: string | null) => context.targetRoles.some((role) => role.id === id)
    session.selection.targetRoleId = available(session.selection.targetRoleId)
      ? session.selection.targetRoleId
      : available(roles.activeTargetRoleId)
        ? roles.activeTargetRoleId
        : (context.targetRoles[0]?.id ?? null)
  }
  return { setupContext: context, session }
}

export async function preparePracticeTrainingEntry(
  input: PracticeTrainingEntryParameters,
): Promise<PracticeTrainingEntryPreparationResponse> {
  const [roles, session] = await Promise.all([getRoles(), practiceFaker.get()])
  const context = setupContext(roles.targetRoles)
  const role = roles.targetRoles.find((role) => role.id === input.targetRoleId)
  const availability: TrainingEntryRoleAvailability = !role
    ? { status: "unavailable", reason: "targetRoleDeleted" }
    : role.isArchived
      ? { status: "unavailable", reason: "targetRoleArchived" }
      : { status: "available" }
  const resolution = resolvePracticeTrainingEntry(context, session.selection, input, availability)
  return {
    page: {
      setupContext: context,
      session: { status: "setup", selection: resolution.configuration },
    },
    resolution,
  }
}

export const startPracticeSession = practiceFaker.start
export const getQuestionGenerationStatus = practiceFaker.pollQuestion
export const requestPracticeHint = practiceFaker.hint
export const requestAnswerFramework = practiceFaker.framework
export const requestPracticeReferenceAnswer = practiceFaker.reference
export const setQuestionSaved = practiceFaker.save
export const setQuestionWeak = practiceFaker.weak
export const submitPrimaryAnswer = practiceFaker.answer
export const requestPracticeFollowUpHint = practiceFaker.followHint
export const requestPracticeFollowUpFramework = practiceFaker.followFramework
export const requestPracticeFollowUpReferenceAnswer = practiceFaker.followReference
export const submitFollowUpAnswer = practiceFaker.answerFollowUp
export const endPracticeFollowUps = practiceFaker.endFollowUps
export const getPracticeEvaluationStatus = practiceFaker.pollEvaluation
export const retryCurrentPracticeQuestion = practiceFaker.retryQuestion
export const continueToNextPracticeQuestion = practiceFaker.nextQuestion
export const skipPracticeQuestion = practiceFaker.skipQuestion
export const endPracticeSession = practiceFaker.endSession
export const prepareNextPracticeSession = practiceFaker.nextSession
