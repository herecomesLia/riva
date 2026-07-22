import type { PracticeAnsweringState } from "@/models/practice"

export function isCurrentPracticeAttemptRetry(session: PracticeAnsweringState): boolean {
  const previousAttempt = session.attemptRecords.at(-1)
  return previousAttempt?.question.id === session.question.id
}
