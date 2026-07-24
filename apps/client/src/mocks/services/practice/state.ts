import { createPracticeMockResponse, type PracticeMockScenario } from "@/mocks/data/practice"
import type { PracticePageResponse } from "@/models/practice"

let response = createPracticeMockResponse()
let sessionSequence = 0
let mutationSequence = 0
const generationPollCounts = new Map<string, number>()
const evaluationPollCounts = new Map<string, number>()
const questionOrdinals = new Map<string, number>()

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

export function resetPracticeMockState(scenario: PracticeMockScenario = "setupReady") {
  response = createPracticeMockResponse(scenario)
  sessionSequence = 0
  mutationSequence = 0
  generationPollCounts.clear()
  evaluationPollCounts.clear()
  questionOrdinals.clear()
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

export function nextGenerationPoll(sessionId: string) {
  const count = (generationPollCounts.get(sessionId) ?? 0) + 1
  generationPollCounts.set(sessionId, count)
  return count
}

export function resetGenerationPoll(sessionId: string) {
  generationPollCounts.set(sessionId, 0)
}

export function nextEvaluationPoll(key: string) {
  const count = (evaluationPollCounts.get(key) ?? 0) + 1
  evaluationPollCounts.set(key, count)
  return count
}

export function resetEvaluationPoll(key: string) {
  evaluationPollCounts.set(key, 0)
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
