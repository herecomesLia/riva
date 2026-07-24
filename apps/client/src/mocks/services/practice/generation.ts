import { createGeneratedPracticeQuestion } from "@/mocks/data/practice"
import type { GetQuestionGenerationStatusInput, PracticePageResponse } from "@/models/practice"

import {
  consumePracticeMockOperation,
  copyPracticeState,
  getPracticeMockState,
  nextGenerationPoll,
  nextQuestionOrdinal,
  setPracticeMockState,
} from "./state"

function completeQuestionGeneration(): PracticePageResponse {
  const currentSession = getPracticeMockState().session
  if (currentSession.status !== "generatingQuestion") {
    throw new Error("Practice session is not generating a question.")
  }

  const ordinal = nextQuestionOrdinal(currentSession.sessionId)
  const question = createGeneratedPracticeQuestion({
    sessionId: currentSession.sessionId,
    ordinal,
    selection: currentSession.selection,
  })

  return {
    ...getPracticeMockState(),
    session: {
      status: "answering",
      sessionId: currentSession.sessionId,
      version: currentSession.version + 1,
      selection: copyPracticeState(currentSession.selection),
      startedAt: currentSession.startedAt,
      attemptId: currentSession.attemptId,
      attemptNumber: currentSession.attemptNumber,
      attemptRecords: copyPracticeState(currentSession.attemptRecords),
      question,
    },
  }
}

export async function getQuestionGenerationStatus(
  input: GetQuestionGenerationStatusInput,
): Promise<PracticePageResponse> {
  await consumePracticeMockOperation("getQuestionGenerationStatus")
  const currentSession = getPracticeMockState().session

  if (
    currentSession.status !== "generatingQuestion" ||
    currentSession.sessionId !== input.sessionId ||
    currentSession.version !== input.version
  ) {
    throw new Error("Practice session version is out of date.")
  }

  const pollCount = nextGenerationPoll(input.sessionId)

  if (pollCount < 2) return copyPracticeState(getPracticeMockState())
  return setPracticeMockState(completeQuestionGeneration())
}
