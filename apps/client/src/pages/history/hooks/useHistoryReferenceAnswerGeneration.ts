import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"

import type {
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
  TrainingRecordKind,
  TrainingRecordReferenceAnswer,
  TrainingRecordReferenceAnswerTarget,
} from "@/models/training-records"
import { generateTrainingRecordReferenceAnswer } from "@/services/training-records"

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
  return { kind, recordId, ...subject }
}

function applyReferenceAnswer<TRecord extends TrainingRecordDetail>(
  record: TRecord,
  target: TrainingRecordReferenceAnswerTarget,
  referenceAnswer: TrainingRecordReferenceAnswer,
): TRecord {
  if (record.id !== target.recordId || record.kind !== target.kind) return record
  const followUpId = target.subject === "followUp" ? target.followUpId : null

  return {
    ...record,
    questions: record.questions.map((question) =>
      question.id !== target.questionId
        ? question
        : target.subject === "mainQuestion"
          ? { ...question, referenceAnswer }
          : {
              ...question,
              followUps: question.followUps.map((followUp) =>
                followUp.id === followUpId ? { ...followUp, referenceAnswer } : followUp,
              ),
            },
    ),
  }
}

export function useHistoryReferenceAnswerGeneration({
  detailQueryKey,
  kind,
  recordId,
}: {
  detailQueryKey: QueryKey
  kind: TrainingRecordKind
  recordId: string
}) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: generateTrainingRecordReferenceAnswer,
    onSuccess: ({ target, referenceAnswer }) => {
      queryClient.setQueryData<TrainingRecordDetail>(detailQueryKey, (current) =>
        current ? applyReferenceAnswer(current, target, referenceAnswer) : current,
      )
    },
  })

  function generate(subject: HistoryReferenceAnswerSubject) {
    mutation.mutate(toTarget(kind, recordId, subject))
  }

  function isRequesting(subject: HistoryReferenceAnswerSubject) {
    return (
      mutation.isPending &&
      mutation.variables !== undefined &&
      targetKey(mutation.variables) === targetKey(toTarget(kind, recordId, subject))
    )
  }

  return { generate, isRequesting }
}
