import { createPracticeMockResponse, type PracticeMockScenario } from "@/mocks/data/practice"
import { saveTrainingRecordSnapshot } from "@/mocks/repositories/training-records"
import { resetTrainingRecordsMockState } from "@/mocks/services/training-records"
import { createTargetedPracticeRecordSnapshot } from "@/mocks/training-record-snapshots"
import { waitForMockDelay } from "@/mocks/utils"
import type { PracticePageResponse } from "@/models/practice"

export type PracticeMockOperation =
  | "continueToNextPracticeQuestion"
  | "endPracticeFollowUps"
  | "endPracticeSession"
  | "getPracticePage"
  | "prepareNextPracticeSession"
  | "preparePracticeTrainingEntry"
  | "requestAnswerFramework"
  | "requestEndPracticeSession"
  | "requestPracticeFollowUpFramework"
  | "requestPracticeFollowUpHint"
  | "requestPracticeFollowUpReferenceAnswer"
  | "requestPracticeHint"
  | "requestPracticeReferenceAnswer"
  | "retryCurrentPracticeQuestion"
  | "setQuestionSaved"
  | "setQuestionWeak"
  | "skipPracticeQuestion"
  | "startPracticeSession"
  | "submitFollowUpAnswer"
  | "submitPrimaryAnswer"

export type PracticeMockUnavailableOperation =
  | "requestAnswerFramework"
  | "requestPracticeFollowUpFramework"
  | "requestPracticeFollowUpHint"
  | "requestPracticeFollowUpReferenceAnswer"
  | "requestPracticeHint"
  | "requestPracticeReferenceAnswer"

export type PracticeMockControllerOptions = {
  defaultDelayMs?: number
  delayNext?: Partial<Record<PracticeMockOperation, number>>
  failNext?: readonly PracticeMockOperation[]
  unavailableNext?: readonly PracticeMockUnavailableOperation[]
}

let response = createPracticeMockResponse()
let sessionSequence = 0
let mutationSequence = 0
let configuredDefaultDelayMs: number | undefined
let historyEntryRoleSelectionRequired = false
const questionOrdinals = new Map<string, number>()
const delayedOperations = new Map<PracticeMockOperation, number>()
const failingOperations = new Set<PracticeMockOperation>()
const unavailableOperations = new Set<PracticeMockOperation>()

export function copyPracticeState<T>(value: T): T {
  return structuredClone(value)
}

export function getPracticeMockState(): PracticePageResponse {
  return response
}

export function setPracticeMockState(next: PracticePageResponse): PracticePageResponse {
  response = copyPracticeState(next)
  return copyPracticeState(response)
}

export function getHistoryEntryRoleSelectionRequired(): boolean {
  return historyEntryRoleSelectionRequired
}

export function setHistoryEntryRoleSelectionRequired(required: boolean): void {
  historyEntryRoleSelectionRequired = required
}

export function resetPracticeMockState(
  scenario: PracticeMockScenario = "setupReady",
  controller: PracticeMockControllerOptions = {},
) {
  const nextDefaultDelayMs = controller.defaultDelayMs
  const nextDelayedOperations = Object.entries(controller.delayNext ?? {})
  if (
    (nextDefaultDelayMs !== undefined && nextDefaultDelayMs < 0) ||
    nextDelayedOperations.some(([, delayMs]) => delayMs !== undefined && delayMs < 0)
  ) {
    throw new Error("Practice mock delay must not be negative.")
  }

  response = createPracticeMockResponse(scenario)
  resetTrainingRecordsMockState()
  if (response.session.status === "completed") {
    saveTrainingRecordSnapshot(
      createTargetedPracticeRecordSnapshot({ ...response, session: response.session }),
    )
  }
  sessionSequence = 0
  mutationSequence = 0
  configuredDefaultDelayMs = nextDefaultDelayMs
  historyEntryRoleSelectionRequired = false
  questionOrdinals.clear()
  delayedOperations.clear()
  failingOperations.clear()
  unavailableOperations.clear()

  for (const operation of controller.failNext ?? []) failingOperations.add(operation)
  for (const operation of controller.unavailableNext ?? []) {
    unavailableOperations.add(operation)
  }
  for (const [operation, delayMs] of nextDelayedOperations) {
    if (delayMs === undefined) continue
    delayedOperations.set(operation as PracticeMockOperation, delayMs)
  }
}

export async function consumePracticeMockOperation(
  operation: PracticeMockOperation,
  fallbackDelayMs: number = 1000,
): Promise<"success" | "unavailable"> {
  const delayMs = delayedOperations.get(operation) ?? configuredDefaultDelayMs ?? fallbackDelayMs
  delayedOperations.delete(operation)
  if (delayMs > 0) await waitForMockDelay(delayMs)

  if (failingOperations.delete(operation)) {
    throw new Error(`Practice mock operation failed: ${operation}`)
  }

  return unavailableOperations.delete(operation) ? "unavailable" : "success"
}

export function nextPracticeSessionSequence() {
  sessionSequence += 1
  return sessionSequence
}

export function initializeQuestionOrdinal(sessionId: string) {
  questionOrdinals.set(sessionId, 0)
}

export function nextQuestionOrdinal(sessionId: string) {
  const ordinal = (questionOrdinals.get(sessionId) ?? 0) + 1
  questionOrdinals.set(sessionId, ordinal)
  return ordinal
}

export function ensureQuestionOrdinal(sessionId: string) {
  if (!questionOrdinals.has(sessionId)) questionOrdinals.set(sessionId, 1)
}

export function nextPracticeMutationTimestamp() {
  mutationSequence += 1
  return new Date(Date.UTC(2026, 6, 20, 3, mutationSequence)).toISOString()
}

export function getCurrentTargetRoleTitle(targetRoleId: string) {
  return (
    response.setupContext.targetRoles.find((role) => role.id === targetRoleId)?.title ??
    "Target role"
  )
}
