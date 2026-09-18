import { practiceFaker } from "@/mocks/fakers/practice"
import { PracticeDifficulty, PracticeQuestionType } from "@/api/generated/models"
import type { PracticeData, PracticeSetupContext } from "@/models/practice-workflow"
import { resolvePracticeTrainingEntry } from "@/models/training-entry"
import type {
  PracticeTrainingEntryParameters,
  PracticeTrainingEntryPreparationResponse,
  TrainingEntryRoleAvailability,
} from "@/models/training-entry"
import type { RoleListResponse } from "@/api/generated/models"
import { listRoles } from "@/services/roles"

function setupContext(roles: RoleListResponse["roles"]): PracticeSetupContext {
  const supportedQuestionTypes = Object.values(PracticeQuestionType)
  return {
    roles: roles
      .filter((role) => !role.isArchived)
      .map(({ id, title, company }) => ({
        id,
        title,
        company,
        supportedQuestionTypes,
      })),
    availableDifficulties: Object.values(PracticeDifficulty),
  }
}

export async function getPracticePage(): Promise<PracticeData> {
  const [roles, session] = await Promise.all([listRoles(), practiceFaker.get()])
  const context = setupContext(roles.roles)
  if (session.status === "setup") {
    const available = (id: string | null) => context.roles.some((role) => role.id === id)
    session.selection.roleId = available(session.selection.roleId)
      ? session.selection.roleId
      : available(roles.activeRoleId)
        ? roles.activeRoleId
        : (context.roles[0]?.id ?? null)
  }
  return { setupContext: context, session }
}

export async function preparePracticeTrainingEntry(
  input: PracticeTrainingEntryParameters,
): Promise<PracticeTrainingEntryPreparationResponse> {
  const [roles, session] = await Promise.all([listRoles(), practiceFaker.get()])
  const context = setupContext(roles.roles)
  const role = roles.roles.find((role) => role.id === input.roleId)
  const availability: TrainingEntryRoleAvailability = !role
    ? { status: "unavailable", reason: "roleDeleted" }
    : role.isArchived
      ? { status: "unavailable", reason: "roleArchived" }
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
export const getPracticeTaskStatus = practiceFaker.pollTask
export const retryPracticeTask = practiceFaker.pollTask
export const submitPrimaryAnswer = practiceFaker.answer
export const submitFollowUpAnswer = practiceFaker.answerFollowUp
export const endPracticeFollowUps = practiceFaker.endFollowUps
export const retryCurrentPracticeQuestion = practiceFaker.retryQuestion
export const continueToNextPracticeQuestion = practiceFaker.nextQuestion
export const skipPracticeQuestion = practiceFaker.skipQuestion
export const endPracticeSession = practiceFaker.endSession
export const prepareNextPracticeSession = practiceFaker.nextSession
