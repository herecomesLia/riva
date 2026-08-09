import type {
  EndPracticeSessionInput,
  PracticeAttemptRecord,
  PracticeCompletedState,
  PracticeMutationResponse,
  RequestEndPracticeSessionInput,
} from "@/models/practice"
import { saveTrainingRecordSnapshot } from "@/mocks/repositories/training-records"
import { createTargetedPracticeRecordSnapshot } from "@/mocks/training-record-snapshots"

import { requireCurrentQuestion } from "./guards"
import {
  consumePracticeMockOperation,
  copyPracticeState,
  getPracticeMockState,
  nextPracticeMutationTimestamp,
  setPracticeMockState,
} from "./state"

export function toAttemptRecord(
  session: import("@/models/practice").PracticeReviewState,
): PracticeAttemptRecord {
  return {
    attemptId: session.attemptId,
    attemptNumber: session.attemptNumber,
    completedAt: session.evaluation.evaluatedAt,
    selection: copyPracticeState(session.selection),
    question: copyPracticeState(session.question),
    mainAnswer: copyPracticeState(session.mainAnswer),
    followUpExchanges: copyPracticeState(session.followUpExchanges),
    followUpCompletion: copyPracticeState(session.followUpCompletion),
    evaluation: copyPracticeState(session.evaluation),
    review: copyPracticeState(session.review),
  }
}

type PracticeCompletionBase = Pick<
  PracticeCompletedState,
  "sessionId" | "language" | "version" | "selection" | "startedAt" | "attemptId" | "attemptNumber"
>

function createCompletedPracticeSession({
  session,
  records,
  completedAt,
  completionReason,
  nextStepSuggestion,
  unfinishedAttempt,
}: {
  session: PracticeCompletionBase
  records: PracticeAttemptRecord[]
  completedAt: string
  completionReason: PracticeCompletedState["completionReason"]
  nextStepSuggestion: string
  unfinishedAttempt: PracticeCompletedState["unfinishedAttempt"]
}): PracticeCompletedState {
  const latestByQuestion = new Map<string, PracticeAttemptRecord>()
  for (const record of records) latestByQuestion.set(record.question.id, record)
  const uniqueRecords = [...latestByQuestion.values()]
  return {
    ...session,
    status: "completed",
    completionReason,
    unfinishedAttempt: copyPracticeState(unfinishedAttempt),
    attemptRecords: copyPracticeState(records),
    completedAt,
    questionsCompleted: uniqueRecords.length,
    retryCount: records.length - uniqueRecords.length,
    savedQuestionCount: uniqueRecords.filter((record) => record.question.isSaved).length,
    markedWeakQuestionCount: uniqueRecords.filter((record) => record.question.isMarkedWeak).length,
    finalAttemptAverageScore:
      uniqueRecords.length === 0
        ? 0
        : Math.round(
            uniqueRecords.reduce((total, record) => total + record.evaluation.overallScore, 0) /
              uniqueRecords.length,
          ),
    nextStepSuggestion,
  }
}

function commitCompletedPracticeSession(session: PracticeCompletedState): PracticeMutationResponse {
  const response = setPracticeMockState({ ...getPracticeMockState(), session })
  if (response.session.status !== "completed") {
    throw new Error("Completed practice session snapshot is invalid.")
  }
  saveTrainingRecordSnapshot(
    createTargetedPracticeRecordSnapshot({ ...response, session: response.session }),
  )
  return response
}

export async function endPracticeSession(
  input: EndPracticeSessionInput,
): Promise<PracticeMutationResponse> {
  await consumePracticeMockOperation("endPracticeSession")
  const session = getPracticeMockState().session
  if (
    session.status !== "review" ||
    session.sessionId !== input.sessionId ||
    session.version !== input.version
  ) {
    throw new Error("Practice session version is out of date.")
  }
  const records = [...copyPracticeState(session.attemptRecords), toAttemptRecord(session)]
  const completionBase: PracticeCompletionBase = {
    sessionId: session.sessionId,
    language: session.language,
    version: session.version + 1,
    selection: copyPracticeState(session.selection),
    startedAt: session.startedAt,
    attemptId: session.attemptId,
    attemptNumber: session.attemptNumber,
  }

  return commitCompletedPracticeSession(
    createCompletedPracticeSession({
      session: completionBase,
      records,
      completedAt: nextPracticeMutationTimestamp(),
      completionReason: "reviewCompleted",
      nextStepSuggestion: "根据本轮复盘优先补足薄弱项，再开始下一轮专项练习。",
      unfinishedAttempt: null,
    }),
  )
}

export async function requestEndPracticeSession(
  input: RequestEndPracticeSessionInput,
): Promise<PracticeMutationResponse> {
  await consumePracticeMockOperation("requestEndPracticeSession")
  const session = requireCurrentQuestion(input)
  const completionBase: PracticeCompletionBase = {
    sessionId: session.sessionId,
    language: session.language,
    version: session.version + 1,
    selection: copyPracticeState(session.selection),
    startedAt: session.startedAt,
    attemptId: session.attemptId,
    attemptNumber: session.attemptNumber,
  }

  return commitCompletedPracticeSession(
    createCompletedPracticeSession({
      session: completionBase,
      records: copyPracticeState(session.attemptRecords),
      completedAt: nextPracticeMutationTimestamp(),
      completionReason: "userEndedEarly",
      nextStepSuggestion: "本轮在提交回答前结束。可重新开始专项练习。",
      unfinishedAttempt: {
        attemptId: session.attemptId,
        attemptNumber: session.attemptNumber,
        selection: copyPracticeState(session.selection),
        question: copyPracticeState(session.question),
      },
    }),
  )
}
