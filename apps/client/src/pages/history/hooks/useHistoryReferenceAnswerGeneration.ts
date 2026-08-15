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

export const HISTORY_REFERENCE_POLL_INTERVAL_MS = 500
export const HISTORY_REFERENCE_POLL_RETRY_DELAY_MS = 250
export const HISTORY_REFERENCE_POLL_RETRY_LIMIT = 2
export const HISTORY_REFERENCE_POLL_TIMEOUT_MS = 30_000

function targetKey(target: TrainingRecordReferenceAnswerTarget): string {
  return [
    target.kind,
    target.recordId,
    target.questionId,
    target.subject,
    target.subject === "followUp" ? target.followUpId : "",
  ].join(":")
}

function pollQueryKey(detailQueryKey: QueryKey, target: TrainingRecordReferenceAnswerTarget) {
  return [...detailQueryKey, "reference-answer-generation", targetKey(target)] as const
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

  if (response.target.kind === "targetedPractice") {
    const targetedRecord = record as TargetedPracticeRecordDetailResponse
    if (response.target.subject === "mainQuestion") {
      return {
        ...targetedRecord,
        questions: targetedRecord.questions.map((question) =>
          question.id === response.target.questionId
            ? { ...question, referenceAnswer: response.referenceAnswer }
            : question,
        ),
      } as TRecord
    }
    const followUpTarget = response.target
    if (!("followUpId" in followUpTarget)) return record
    return {
      ...targetedRecord,
      questions: targetedRecord.questions.map((question) =>
        question.id !== response.target.questionId
          ? question
          : {
              ...question,
              followUps: question.followUps.map((followUp) =>
                followUp.id === followUpTarget.followUpId
                  ? { ...followUp, referenceAnswer: response.referenceAnswer }
                  : followUp,
              ),
            },
      ),
    } as TRecord
  }

  const interviewRecord = record as MockInterviewRecordDetailResponse
  if (response.target.subject === "mainQuestion") {
    return {
      ...interviewRecord,
      questions: interviewRecord.questions.map((question) =>
        question.id === response.target.questionId
          ? { ...question, referenceAnswer: response.referenceAnswer }
          : question,
      ),
    } as TRecord
  }
  const followUpTarget = response.target
  if (!("followUpId" in followUpTarget)) return record
  return {
    ...interviewRecord,
    questions: interviewRecord.questions.map((question) =>
      question.id !== response.target.questionId
        ? question
        : {
            ...question,
            followUps: question.followUps.map((followUp) =>
              followUp.id === followUpTarget.followUpId
                ? { ...followUp, referenceAnswer: response.referenceAnswer }
                : followUp,
            ),
          },
    ),
  } as TRecord
}

function generatingTargets(record: TrainingRecordDetail): TrainingRecordReferenceAnswerTarget[] {
  return record.questions.flatMap((question) => [
    ...(["generating", "pollingRetrying"].includes(question.referenceAnswer.status)
      ? [
          toTarget(record.kind, record.id, {
            subject: "mainQuestion",
            questionId: question.id,
          }),
        ]
      : []),
    ...question.followUps.flatMap((followUp) =>
      ["generating", "pollingRetrying"].includes(followUp.referenceAnswer.status)
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

function referenceAnswerForTarget(
  record: TrainingRecordDetail,
  target: TrainingRecordReferenceAnswerTarget,
) {
  const question = record.questions.find(({ id }) => id === target.questionId)
  if (!question) return undefined
  return target.subject === "mainQuestion"
    ? question.referenceAnswer
    : question.followUps.find(({ id }) => id === target.followUpId)?.referenceAnswer
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
  const requestLocks = useRef(new Set<string>())
  const activeTargetKeys = useRef(new Set<string>())
  const activeTargetsByKey = useRef(new Map<string, TrainingRecordReferenceAnswerTarget>())
  const pollingStartedAt = useRef(new Map<string, number>())
  const processedPolls = useRef(new Map<string, number>())
  const processedRetryCounts = useRef(new Map<string, number>())
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

  const deactivateTarget = useCallback((target: TrainingRecordReferenceAnswerTarget) => {
    const key = targetKey(target)
    activeTargetKeys.current.delete(key)
    activeTargetsByKey.current.delete(key)
    pollingStartedAt.current.delete(key)
    processedPolls.current.delete(key)
    processedRetryCounts.current.delete(key)
    setActiveTargets((current) => current.filter((candidate) => targetKey(candidate) !== key))
  }, [])

  const activateTarget = useCallback((target: TrainingRecordReferenceAnswerTarget) => {
    const key = targetKey(target)
    if (activeTargetKeys.current.has(key)) return
    activeTargetKeys.current.add(key)
    activeTargetsByKey.current.set(key, target)
    pollingStartedAt.current.set(key, Date.now())
    setActiveTargets((current) => [...current, target])
  }, [])

  const failPolling = useCallback(
    (target: TrainingRecordReferenceAnswerTarget, reason: "consecutiveFailures" | "timeout") => {
      if (target.kind === "mockInterview") {
        updateDetail({
          target,
          referenceAnswer: { status: "pollingFailed", content: null, reason },
        })
      } else if (target.subject === "mainQuestion") {
        updateDetail({
          target,
          referenceAnswer: { status: "unavailable", content: null, viewedBeforeSubmission: false },
        })
      } else {
        updateDetail({
          target,
          referenceAnswer: { status: "unavailable", content: null, viewedBeforeSubmission: false },
        })
      }
      deactivateTarget(target)
    },
    [deactivateTarget, updateDetail],
  )

  useEffect(() => {
    if (!enabled || !record) return
    generatingTargets(record).forEach(activateTarget)
  }, [activateTarget, enabled, record])

  const requestMutation = useMutation({
    mutationFn: requestTrainingRecordReferenceAnswer,
    onSuccess: (response) => {
      updateDetail(response)
      if (response.referenceAnswer.status === "generating") {
        activateTarget(response.target)
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
    queries: enabled
      ? activeTargets.map((target) => ({
          queryFn: () => getTrainingRecordReferenceAnswerGenerationStatus(target),
          queryKey: pollQueryKey(detailQueryKey, target),
          refetchInterval: (query: {
            state: { data?: TrainingRecordReferenceAnswerGenerationResponse }
          }) =>
            query.state.data === undefined ||
            query.state.data.referenceAnswer.status === "generating"
              ? HISTORY_REFERENCE_POLL_INTERVAL_MS
              : false,
          retry: HISTORY_REFERENCE_POLL_RETRY_LIMIT,
          retryDelay: HISTORY_REFERENCE_POLL_RETRY_DELAY_MS,
        }))
      : [],
  })

  useEffect(() => {
    if (!enabled) return
    polls.forEach((poll, index) => {
      const target = activeTargets[index]
      if (!target) return
      const key = targetKey(target)
      if (poll.isError) {
        failPolling(target, "consecutiveFailures")
        return
      }
      if (
        target.kind === "mockInterview" &&
        poll.failureCount > 0 &&
        processedRetryCounts.current.get(key) !== poll.failureCount
      ) {
        processedRetryCounts.current.set(key, poll.failureCount)
        updateDetail({
          target,
          referenceAnswer: { status: "pollingRetrying", content: null },
        })
      }
      if (!poll.data || processedPolls.current.get(key) === poll.dataUpdatedAt) return

      processedPolls.current.set(key, poll.dataUpdatedAt)
      processedRetryCounts.current.delete(key)
      updateDetail(poll.data)
      if (poll.data.referenceAnswer.status !== "generating") deactivateTarget(target)
    })
  }, [activeTargets, deactivateTarget, enabled, failPolling, polls, updateDetail])

  useEffect(() => {
    if (!enabled) return
    const timers = activeTargets.map((target) => {
      const key = targetKey(target)
      const startedAt = pollingStartedAt.current.get(key) ?? Date.now()
      const remaining = Math.max(0, HISTORY_REFERENCE_POLL_TIMEOUT_MS - (Date.now() - startedAt))
      return setTimeout(() => failPolling(target, "timeout"), remaining)
    })
    return () => timers.forEach(clearTimeout)
  }, [activeTargets, enabled, failPolling])

  useEffect(
    () => () => {
      activeTargetsByKey.current.forEach((target) => {
        queryClient.removeQueries({
          exact: true,
          queryKey: pollQueryKey(detailQueryKey, target),
        })
      })
      activeTargetKeys.current.clear()
      activeTargetsByKey.current.clear()
      pollingStartedAt.current.clear()
      processedPolls.current.clear()
      processedRetryCounts.current.clear()
    },
    [detailQueryKey, queryClient],
  )

  function generate(subject: HistoryReferenceAnswerSubject) {
    if (!enabled) return
    const target = toTarget(kind, recordId, subject)
    const key = targetKey(target)
    if (requestLocks.current.has(key) || activeTargetKeys.current.has(key)) return

    const currentReferenceAnswer = record ? referenceAnswerForTarget(record, target) : undefined
    if (target.kind === "mockInterview" && currentReferenceAnswer?.status === "pollingFailed") {
      queryClient.removeQueries({ exact: true, queryKey: pollQueryKey(detailQueryKey, target) })
      updateDetail({
        target,
        referenceAnswer: { status: "generating", content: null },
      })
      activateTarget(target)
      return
    }
    if (
      currentReferenceAnswer?.status === "generating" ||
      currentReferenceAnswer?.status === "pollingRetrying"
    ) {
      activateTarget(target)
      return
    }

    requestLocks.current.add(key)
    setRequestingKeys((current) => new Set(current).add(key))
    requestMutation.mutate(target)
  }

  function isRequesting(subject: HistoryReferenceAnswerSubject): boolean {
    return requestingKeys.has(targetKey(toTarget(kind, recordId, subject)))
  }

  return { generate, isRequesting }
}
