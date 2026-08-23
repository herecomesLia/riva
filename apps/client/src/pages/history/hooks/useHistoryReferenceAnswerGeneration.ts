import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"

import type {
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
  TrainingRecordKind,
  TrainingRecordReferenceAnswerGenerationResponse,
  TrainingRecordReferenceAnswerTarget,
} from "@/models/training-records"
import { requestTrainingRecordReferenceAnswer } from "@/services/training-records"

type TrainingRecordDetail = TargetedPracticeRecordDetailResponse | MockInterviewRecordDetailResponse

export type HistoryReferenceAnswerSubject =
  | { subject: "mainQuestion"; questionId: string }
  | { subject: "followUp"; questionId: string; followUpId: string }

function targetKey(target: TrainingRecordReferenceAnswerTarget): string {
  return [
    target.kind,
    target.recordId,
    target.questionId,
    target.subject,
    target.subject === "followUp" ? target.followUpId : "",
  ].join(":")
}

function toTarget(
  kind: TrainingRecordKind,
  recordId: string,
  subject: HistoryReferenceAnswerSubject,
): TrainingRecordReferenceAnswerTarget {
  return subject.subject === "mainQuestion"
    ? { kind, recordId, questionId: subject.questionId, subject: subject.subject }
    : {
        kind,
        recordId,
        questionId: subject.questionId,
        subject: subject.subject,
        followUpId: subject.followUpId,
      }
}

export function applyReferenceAnswerGeneration<TRecord extends TrainingRecordDetail>(
  record: TRecord,
  response: TrainingRecordReferenceAnswerGenerationResponse,
): TRecord {
  if (record.id !== response.target.recordId || record.kind !== response.target.kind) return record

  if (response.target.subject === "mainQuestion") {
    return {
      ...record,
      questions: record.questions.map((question) =>
        question.id === response.target.questionId
          ? { ...question, referenceAnswer: response.referenceAnswer }
          : question,
      ),
    } as TRecord
  }

  return {
    ...record,
    questions: record.questions.map((question) =>
      question.id !== response.target.questionId
        ? question
        : {
            ...question,
            followUps: question.followUps.map((followUp) =>
              followUp.id === response.target.followUpId
                ? { ...followUp, referenceAnswer: response.referenceAnswer }
                : followUp,
            ),
          },
    ),
  } as TRecord
}

export function useHistoryReferenceAnswerGeneration({
  detailQueryKey,
  enabled = true,
  kind,
  record,
  recordId,
}: {
  detailQueryKey: QueryKey
  enabled?: boolean
  kind: TrainingRecordKind
  record: TrainingRecordDetail | undefined
  recordId: string
}) {
  const queryClient = useQueryClient()
  const requestMutation = useMutation({
    mutationFn: requestTrainingRecordReferenceAnswer,
    onSuccess: (response) => {
      queryClient.setQueryData<TrainingRecordDetail>(detailQueryKey, (current) =>
        current ? applyReferenceAnswerGeneration(current, response) : current,
      )
    },
  })

  function generate(subject: HistoryReferenceAnswerSubject) {
    if (!enabled || !record || requestMutation.isPending) return
    requestMutation.mutate(toTarget(kind, recordId, subject))
  }

  function isRequesting(subject: HistoryReferenceAnswerSubject): boolean {
    return (
      requestMutation.isPending &&
      requestMutation.variables !== undefined &&
      targetKey(requestMutation.variables) === targetKey(toTarget(kind, recordId, subject))
    )
  }

  return { generate, isRequesting }
}
