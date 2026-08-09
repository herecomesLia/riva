import type {
  ContinueToNextPracticeQuestionInput,
  PracticeMutationResponse,
  RetryCurrentPracticeQuestionInput,
} from "@/models/practice"

import { toAttemptRecord } from "./completion"
import { requireReview } from "./guards"
import {
  consumePracticeMockOperation,
  copyPracticeState,
  getPracticeMockState,
  resetGenerationPoll,
  setPracticeMockState,
} from "./state"

export async function retryCurrentPracticeQuestion(
  input: RetryCurrentPracticeQuestionInput,
): Promise<PracticeMutationResponse> {
  await consumePracticeMockOperation("retryCurrentPracticeQuestion")
  const session = requireReview(input)
  if (session.question.referenceAnswer.status !== "revealed") {
    throw new Error("Practice review reference answer is missing.")
  }
  const previousAttempt = toAttemptRecord(session)
  const nextAttemptNumber = session.attemptNumber + 1

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      status: "answering",
      sessionId: session.sessionId,
      language: session.language,
      version: session.version + 1,
      selection: copyPracticeState(session.selection),
      startedAt: session.startedAt,
      attemptId: `${session.sessionId}_attempt_${nextAttemptNumber}`,
      attemptNumber: nextAttemptNumber,
      attemptRecords: [...copyPracticeState(session.attemptRecords), previousAttempt],
      question: {
        ...copyPracticeState(session.question),
        referenceAnswer: {
          status: "revealed",
          content: copyPracticeState(session.question.referenceAnswer.content),
          viewedBeforeSubmission: true,
        },
      },
    },
  })
}

export async function continueToNextPracticeQuestion(
  input: ContinueToNextPracticeQuestionInput,
): Promise<PracticeMutationResponse> {
  await consumePracticeMockOperation("continueToNextPracticeQuestion")
  const session = requireReview(input)
  const previousAttempt = toAttemptRecord(session)
  const recommendation = session.review.recommendation
  const selection =
    recommendation.action === "nextQuestion"
      ? {
          ...session.selection,
          questionType: recommendation.nextQuestion.questionType,
          difficulty: recommendation.nextQuestion.difficulty,
        }
      : session.selection
  resetGenerationPoll(session.sessionId)

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      status: "generatingQuestion",
      sessionId: session.sessionId,
      language: session.language,
      version: session.version + 1,
      selection: copyPracticeState(selection),
      startedAt: session.startedAt,
      attemptId: `${session.sessionId}_attempt_${session.attemptNumber + 1}`,
      attemptNumber: session.attemptNumber + 1,
      attemptRecords: [...copyPracticeState(session.attemptRecords), previousAttempt],
      previousAttempt,
    },
  })
}
