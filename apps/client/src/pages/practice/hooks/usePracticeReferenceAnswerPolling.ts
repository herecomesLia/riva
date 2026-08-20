import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"

import { useAgentPolling } from "@/lib/agent-polling"
import type {
  GetPracticeFollowUpReferenceAnswerStatusInput,
  GetPracticeReferenceAnswerStatusInput,
  PracticePageResponse,
} from "@/models/practice"
import {
  getPracticeFollowUpReferenceAnswerStatus,
  getPracticeReferenceAnswerStatus,
} from "@/services/practice"

import {
  getPracticeResponseSession,
  synchronizePracticeReferenceAnswerResponse,
} from "../practice-cache"
import { PRACTICE_QUERY_KEY } from "./usePracticeSession"

export function usePracticeReferenceAnswerPolling(data: PracticePageResponse | undefined) {
  const queryClient = useQueryClient()
  const mainSession =
    data?.session.status === "answering" &&
    data.session.question.referenceAnswer.status === "generating"
      ? data.session
      : null
  const followUpSession =
    data?.session.status === "answeringFollowUp" &&
    data.session.currentFollowUp.question.referenceAnswer.status === "generating"
      ? data.session
      : null

  const mainInput: GetPracticeReferenceAnswerStatusInput | null = useMemo(
    () =>
      mainSession
        ? {
            sessionId: mainSession.sessionId,
            version: mainSession.version,
            questionId: mainSession.question.id,
          }
        : null,
    [mainSession],
  )
  const followUpInput: GetPracticeFollowUpReferenceAnswerStatusInput | null = useMemo(
    () =>
      followUpSession
        ? {
            sessionId: followUpSession.sessionId,
            version: followUpSession.version,
            questionId: followUpSession.question.id,
            followUpQuestionId: followUpSession.currentFollowUp.question.id,
          }
        : null,
    [followUpSession],
  )
  const mainPolling = useAgentPolling(
    mainInput
      ? `practice-reference-main:${mainInput.sessionId}:${mainInput.version}:${mainInput.questionId}`
      : null,
  )
  const followUpPolling = useAgentPolling(
    followUpInput
      ? `practice-reference-follow-up:${followUpInput.sessionId}:${followUpInput.version}:${followUpInput.questionId}:${followUpInput.followUpQuestionId}`
      : null,
  )

  const mainQuery = useQuery({
    enabled: mainInput !== null && !mainPolling.isTimedOut,
    queryFn: () => {
      if (mainInput === null) throw new Error("A generating main reference answer is required.")
      return getPracticeReferenceAnswerStatus(mainInput)
    },
    queryKey: [
      ...PRACTICE_QUERY_KEY,
      "reference-answer",
      "main",
      mainInput?.sessionId,
      mainInput?.version,
      mainInput?.questionId,
    ],
    refetchInterval: (query) => {
      const response = query.state.data
      if (!response) return mainInput === null ? false : mainPolling.getPollingInterval()
      const responseSession = getPracticeResponseSession(response)
      if (responseSession.status !== "answering") return false
      return responseSession.question.referenceAnswer.status === "generating"
        ? mainPolling.getPollingInterval()
        : false
    },
    retry: true,
  })

  const followUpQuery = useQuery({
    enabled: followUpInput !== null && !followUpPolling.isTimedOut,
    queryFn: () => {
      if (followUpInput === null) {
        throw new Error("A generating follow-up reference answer is required.")
      }
      return getPracticeFollowUpReferenceAnswerStatus(followUpInput)
    },
    queryKey: [
      ...PRACTICE_QUERY_KEY,
      "reference-answer",
      "followUp",
      followUpInput?.sessionId,
      followUpInput?.version,
      followUpInput?.questionId,
      followUpInput?.followUpQuestionId,
    ],
    refetchInterval: (query) => {
      const response = query.state.data
      if (!response) return followUpInput === null ? false : followUpPolling.getPollingInterval()
      const responseSession = getPracticeResponseSession(response)
      return responseSession.status === "answeringFollowUp" &&
        responseSession.currentFollowUp.question.referenceAnswer.status === "generating"
        ? followUpPolling.getPollingInterval()
        : false
    },
    retry: true,
  })

  useEffect(() => {
    if (mainQuery.data === undefined || mainInput === null) return
    queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
      synchronizePracticeReferenceAnswerResponse(current, mainQuery.data, mainInput),
    )
  }, [mainInput, mainQuery.data, queryClient])

  useEffect(() => {
    if (followUpQuery.data === undefined || followUpInput === null) return
    queryClient.setQueryData<PracticePageResponse | undefined>(PRACTICE_QUERY_KEY, (current) =>
      synchronizePracticeReferenceAnswerResponse(current, followUpQuery.data, followUpInput),
    )
  }, [followUpInput, followUpQuery.data, queryClient])

  return {
    referenceAnswerError:
      mainPolling.isTimedOut ||
      followUpPolling.isTimedOut ||
      mainQuery.isError ||
      followUpQuery.isError,
    referenceAnswerPollingTimedOut: mainPolling.isTimedOut || followUpPolling.isTimedOut,
    isReferenceAnswerRetrying: mainQuery.isFetching || followUpQuery.isFetching,
    retryReferenceAnswer: () => {
      if (mainInput !== null) {
        mainPolling.reset()
        void mainQuery.refetch()
      }
      if (followUpInput !== null) {
        followUpPolling.reset()
        void followUpQuery.refetch()
      }
    },
  }
}
