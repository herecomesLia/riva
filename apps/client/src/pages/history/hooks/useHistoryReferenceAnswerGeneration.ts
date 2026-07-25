import { useMutation, useQueries, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import type {
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
  TrainingRecordKind,
  TrainingRecordReferenceAnswerGenerationResponse,
  TrainingRecordReferenceAnswerTarget,
} from "@/models/training-records"
import {
  getTrainingRecordReferenceAnswerGenerationStatus,
  requestTrainingRecordReferenceAnswer,
} from "@/services/training-records"

type TrainingRecordDetail = TargetedPracticeRecordDetailResponse | MockInterviewRecordDetailResponse

export type HistoryReferenceAnswerSubject =
  | { subject: "mainQuestion"; questionId: string }
  | { subject: "followUp"; questionId: string; followUpId: string }

const pollIntervalMs = 500

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
  if (kind === "targetedPractice") {
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
  const followUpId = response.target.subject === "followUp" ? response.target.followUpId : null

  return {
    ...record,
    questions: record.questions.map((question) =>
      question.id !== response.target.questionId
        ? question
        : response.target.subject === "mainQuestion"
          ? { ...question, referenceAnswer: response.referenceAnswer }
          : {
              ...question,
              followUps: question.followUps.map((followUp) =>
                followUp.id === followUpId
                  ? { ...followUp, referenceAnswer: response.referenceAnswer }
                  : followUp,
              ),
            },
    ),
  }
}

function generatingTargets(record: TrainingRecordDetail): TrainingRecordReferenceAnswerTarget[] {
  return record.questions.flatMap((question) => [
    ...(question.referenceAnswer.status === "generating"
      ? [
          toTarget(record.kind, record.id, {
            subject: "mainQuestion",
            questionId: question.id,
          }),
        ]
      : []),
    ...question.followUps.flatMap((followUp) =>
      followUp.referenceAnswer.status === "generating"
        ? [
            toTarget(record.kind, record.id, {
              subject: "followUp",
              questionId: question.id,
              followUpId: followUp.id,
            }),
          ]
        : [],
    ),
  ])
}

export function useHistoryReferenceAnswerGeneration({
  detailQueryKey,
  kind,
  record,
  recordId,
}: {
  detailQueryKey: QueryKey
  kind: TrainingRecordKind
  record: TrainingRecordDetail | undefined
  recordId: string
}) {
  const queryClient = useQueryClient()
  const requestLocks = useRef(new Set<string>())
  const processedPolls = useRef(new Map<string, number>())
  const [requestingKeys, setRequestingKeys] = useState<Set<string>>(() => new Set())
  const [activeTargets, setActiveTargets] = useState<TrainingRecordReferenceAnswerTarget[]>([])

  const updateDetail = useCallback(
    (response: TrainingRecordReferenceAnswerGenerationResponse) => {
      queryClient.setQueryData<TrainingRecordDetail>(detailQueryKey, (current) =>
        current ? applyReferenceAnswerGeneration(current, response) : current,
      )
    },
    [detailQueryKey, queryClient],
  )

  useEffect(() => {
    if (!record) return
    const generating = generatingTargets(record)
    if (generating.length === 0) return
    setActiveTargets((current) => {
      const existing = new Set(current.map(targetKey))
      const additions = generating.filter((target) => !existing.has(targetKey(target)))
      return additions.length === 0 ? current : [...current, ...additions]
    })
  }, [record])

  const requestMutation = useMutation({
    mutationFn: requestTrainingRecordReferenceAnswer,
    onSuccess: (response) => {
      updateDetail(response)
      if (response.referenceAnswer.status === "generating") {
        setActiveTargets((current) =>
          current.some((target) => targetKey(target) === targetKey(response.target))
            ? current
            : [...current, response.target],
        )
      }
    },
    onSettled: (_data, _error, target) => {
      const key = targetKey(target)
      requestLocks.current.delete(key)
      setRequestingKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    },
  })

  const polls = useQueries({
    queries: activeTargets.map((target) => ({
      queryFn: () => getTrainingRecordReferenceAnswerGenerationStatus(target),
      queryKey: [...detailQueryKey, "reference-answer-generation", targetKey(target)],
      refetchInterval: (query: {
        state: { data?: TrainingRecordReferenceAnswerGenerationResponse }
      }) =>
        query.state.data === undefined || query.state.data.referenceAnswer.status === "generating"
          ? pollIntervalMs
          : false,
      retry: false,
    })),
  })

  useEffect(() => {
    const terminalKeys: string[] = []
    polls.forEach((poll, index) => {
      const target = activeTargets[index]
      if (!target) return
      const key = targetKey(target)
      if (poll.isError) {
        terminalKeys.push(key)
        return
      }
      if (!poll.data || processedPolls.current.get(key) === poll.dataUpdatedAt) return

      processedPolls.current.set(key, poll.dataUpdatedAt)
      updateDetail(poll.data)
      if (poll.data.referenceAnswer.status !== "generating") terminalKeys.push(key)
    })
    if (terminalKeys.length === 0) return
    const terminal = new Set(terminalKeys)
    setActiveTargets((current) => current.filter((target) => !terminal.has(targetKey(target))))
  }, [activeTargets, polls, updateDetail])

  function generate(subject: HistoryReferenceAnswerSubject) {
    const target = toTarget(kind, recordId, subject)
    const key = targetKey(target)
    if (requestLocks.current.has(key)) return

    requestLocks.current.add(key)
    setRequestingKeys((current) => new Set(current).add(key))
    requestMutation.mutate(target)
  }

  function isRequesting(subject: HistoryReferenceAnswerSubject): boolean {
    return requestingKeys.has(targetKey(toTarget(kind, recordId, subject)))
  }

  return { generate, isRequesting }
}
