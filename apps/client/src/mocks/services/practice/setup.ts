import { derivePracticeSupportedQuestionTypes } from "@/mocks/data/role-fixture-builders"
import { getRolesPage } from "@/mocks/services/roles"
import type {
  PracticeMutationResponse,
  PracticePageResponse,
  PrepareNextPracticeSessionInput,
  PracticeSetupContext,
  PracticeSetupSelection,
  PracticeTargetRoleOption,
  StartPracticeSessionInput,
} from "@/models/practice"
import type { RolesPageResponse, TargetRole } from "@/models/roles"
import {
  resolvePracticeTrainingEntry,
  resolveTrainingEntryRoleAvailability,
  type PracticeTrainingEntryPreparationResponse,
  type PracticeTrainingEntryParameters,
} from "@/models/training-entry"

import {
  consumePracticeMockOperation,
  copyPracticeState,
  getHistoryEntryRoleSelectionRequired,
  getPracticeMockState,
  initializeQuestionOrdinal,
  nextPracticeSessionSequence,
  setPracticeMockState,
  setHistoryEntryRoleSelectionRequired,
} from "./state"

function toPracticeRoleOption(role: TargetRole): PracticeTargetRoleOption {
  return {
    id: role.id,
    title: role.title,
    company: role.company,
    supportedQuestionTypes: derivePracticeSupportedQuestionTypes(role),
  }
}

async function getCurrentSetupContext(
  rolesResponse?: RolesPageResponse,
): Promise<PracticeSetupContext> {
  const currentRoles = rolesResponse ?? (await getRolesPage())
  const targetRoles = currentRoles.roles
    .filter((role) => role.preparationStatus !== "archived")
    .map(toPracticeRoleOption)
  const defaultTargetRoleId = targetRoles.some((role) => role.id === currentRoles.currentRoleId)
    ? currentRoles.currentRoleId
    : null

  return {
    targetRoles,
    defaultTargetRoleId,
    availableDifficulties: ["basic", "pressure"],
    eligibleQuestionCounts: copyPracticeState(
      getPracticeMockState().setupContext.eligibleQuestionCounts,
    ),
  }
}

export function reconcilePracticeSetupSelection(
  context: PracticeSetupContext,
  selection: PracticeSetupSelection,
): PracticeSetupSelection {
  const existingRole = context.targetRoles.find((role) => role.id === selection.targetRoleId)
  const defaultRole = context.targetRoles.find((role) => role.id === context.defaultTargetRoleId)
  const selectedRole = existingRole ?? defaultRole ?? context.targetRoles[0]

  if (!selectedRole) return { ...selection, targetRoleId: null }

  return {
    ...selection,
    targetRoleId: selectedRole.id,
    questionType: selectedRole.supportedQuestionTypes.includes(selection.questionType)
      ? selection.questionType
      : (selectedRole.supportedQuestionTypes[0] ?? selection.questionType),
  }
}

function withSetupContext(setupContext: PracticeSetupContext): PracticePageResponse {
  const current = getPracticeMockState()
  if (current.session.status !== "setup") {
    return { ...current, setupContext }
  }
  if (getHistoryEntryRoleSelectionRequired()) {
    return { ...current, setupContext }
  }

  return {
    ...current,
    setupContext,
    session: {
      ...current.session,
      selection: reconcilePracticeSetupSelection(setupContext, current.session.selection),
    },
  }
}

export async function getPracticePage(): Promise<PracticePageResponse> {
  await consumePracticeMockOperation("getPracticePage", 0)
  const setupContext = await getCurrentSetupContext()
  return setPracticeMockState(withSetupContext(setupContext))
}

function requireValidSelection(
  setupContext: PracticeSetupContext,
  input: StartPracticeSessionInput,
) {
  const role = setupContext.targetRoles.find((candidate) => candidate.id === input.targetRoleId)
  if (!role) throw new Error("Target role was not found.")
  if (!role.supportedQuestionTypes.includes(input.questionType)) {
    throw new Error("Question type is not supported by the selected role.")
  }
  if (input.source === "saved" && setupContext.eligibleQuestionCounts.saved === 0) {
    throw new Error("No eligible saved questions are available.")
  }
  if (input.source === "history" && setupContext.eligibleQuestionCounts.history === 0) {
    throw new Error("No eligible history questions are available.")
  }
}

export async function startPracticeSession(
  input: StartPracticeSessionInput,
): Promise<PracticeMutationResponse> {
  await consumePracticeMockOperation("startPracticeSession", 0)
  const current = await getPracticePage()
  requireValidSelection(current.setupContext, input)
  setHistoryEntryRoleSelectionRequired(false)
  const sessionSequence = nextPracticeSessionSequence()
  const sessionId = `practice_session_generated_${sessionSequence}`
  initializeQuestionOrdinal(sessionId)

  return setPracticeMockState({
    ...current,
    session: {
      status: "generatingQuestion",
      sessionId,
      version: 1,
      selection: copyPracticeState(input),
      startedAt: new Date(Date.UTC(2026, 6, 20, 2, sessionSequence)).toISOString(),
      attemptId: `${sessionId}_attempt_1`,
      attemptNumber: 1,
      attemptRecords: [],
      previousAttempt: null,
    },
  })
}

export async function prepareNextPracticeSession(
  input: PrepareNextPracticeSessionInput,
): Promise<PracticeMutationResponse> {
  await consumePracticeMockOperation("prepareNextPracticeSession")
  const session = getPracticeMockState().session
  if (
    session.status !== "completed" ||
    session.sessionId !== input.sessionId ||
    session.version !== input.version
  ) {
    throw new Error("Practice session version is out of date.")
  }

  const setupContext = await getCurrentSetupContext()
  setHistoryEntryRoleSelectionRequired(false)
  return setPracticeMockState({
    setupContext,
    session: {
      status: "setup",
      selection: reconcilePracticeSetupSelection(setupContext, session.selection),
    },
  })
}

export async function preparePracticeTrainingEntry(
  input: PracticeTrainingEntryParameters,
): Promise<PracticeTrainingEntryPreparationResponse> {
  await consumePracticeMockOperation("preparePracticeTrainingEntry", 0)
  const current = getPracticeMockState()
  const rolesResponse = await getRolesPage()
  const setupContext = await getCurrentSetupContext(rolesResponse)
  const roleAvailability = resolveTrainingEntryRoleAvailability(
    rolesResponse.roles,
    setupContext.targetRoles.map(({ id }) => id),
    input.targetRoleId,
  )
  const resolution = resolvePracticeTrainingEntry(
    setupContext,
    current.session.selection,
    input,
    roleAvailability,
  )
  setHistoryEntryRoleSelectionRequired(resolution.status === "roleUnavailable")
  const page = setPracticeMockState({
    setupContext,
    session: {
      status: "setup",
      selection: resolution.configuration,
    },
  })
  return { page, resolution }
}
