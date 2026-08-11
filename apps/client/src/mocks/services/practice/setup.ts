import { getCurrentInteractionLanguage } from "@/i18n/language"
import { getRolesPage } from "@/mocks/services/roles"
import { buildPracticeSetupContext, reconcilePracticeSetupSelection } from "@/models/practice-setup"
import type {
  PracticeMutationResponse,
  PracticePageResponse,
  PrepareNextPracticeSessionInput,
  PracticeSetupContext,
  StartPracticeSessionInput,
} from "@/models/practice"
import type { RolesPageResponse } from "@/models/roles"
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

async function getCurrentSetupContext(
  rolesResponse?: RolesPageResponse,
): Promise<PracticeSetupContext> {
  const currentRoles = rolesResponse ?? (await getRolesPage())
  return buildPracticeSetupContext(currentRoles, {
    canPrioritizeWeaknesses: true,
    eligibleQuestionCounts: copyPracticeState(
      getPracticeMockState().setupContext.eligibleQuestionCounts,
    ),
  })
}

export { reconcilePracticeSetupSelection }

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
      language: getCurrentInteractionLanguage(),
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
