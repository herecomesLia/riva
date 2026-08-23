import type { PracticeQuestionMutationInput } from "@/models/practice"

import { getPracticeMockState } from "./state"

export function requireCurrentQuestion(input: PracticeQuestionMutationInput) {
  const session = getPracticeMockState().session
  if (
    session.status !== "answering" ||
    session.sessionId !== input.sessionId ||
    session.version !== input.version ||
    session.question.id !== input.questionId
  ) {
    throw new Error("Practice question version is out of date.")
  }
  return session
}

export function requireCurrentFollowUp(
  input: PracticeQuestionMutationInput & { followUpQuestionId: string },
) {
  const session = getPracticeMockState().session
  if (
    session.status !== "answeringFollowUp" ||
    session.sessionId !== input.sessionId ||
    session.version !== input.version ||
    session.question.id !== input.questionId ||
    session.currentFollowUp.question.id !== input.followUpQuestionId
  ) {
    throw new Error("Practice follow-up version is out of date.")
  }
  return session
}

export function requireCurrentReviewableQuestion(input: PracticeQuestionMutationInput) {
  const session = getPracticeMockState().session
  if (
    (session.status !== "answering" && session.status !== "review") ||
    session.sessionId !== input.sessionId ||
    session.version !== input.version ||
    session.question.id !== input.questionId
  ) {
    throw new Error("Practice question version is out of date.")
  }
  return session
}

export function requireReview(input: PracticeQuestionMutationInput) {
  const session = getPracticeMockState().session
  if (
    session.status !== "review" ||
    session.sessionId !== input.sessionId ||
    session.version !== input.version ||
    session.question.id !== input.questionId
  ) {
    throw new Error("Practice review version is out of date.")
  }
  return session
}
