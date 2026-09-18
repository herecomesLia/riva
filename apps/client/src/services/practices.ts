import { getPracticesApi } from "@/api/generated/endpoints/practices/practices"
import type { PracticeResponse } from "@/api/generated/models"

// API contract used by both the backend and MSW. Page orchestration lives in hooks.
const api = getPracticesApi()

export const {
  listPractices,
  createPractice,
  getPractice,
  deletePractice,
  getPracticeRound,
  submitPracticeAnswer,
  skipPracticeRound,
  finishPracticeRound,
  restartPracticeRound,
  startNextPracticeRound,
  endPracticeSession,
  getPracticeTaskState,
  retryPracticeTask,
} = api

export async function getActivePractice(
  options?: Parameters<typeof api.getActivePractice>[0],
): Promise<PracticeResponse | void> {
  // Axios represents an empty HTTP 204 body as an empty string.
  const response = (await api.getActivePractice(options)) as PracticeResponse | void | ""
  return response === "" ? undefined : response
}
