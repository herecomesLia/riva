import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

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

  const mainInput: GetPracticeReferenceAnswerStatusInput | null = mainSession
    ? {
        sessionId: mainSession.sessionId,
        version: mainSession.version,
        questionId: mainSession.question.id,
      }
    : null
  const followUpInput: GetPracticeFollowUpReferenceAnswerStatusInput | null = followUpSession
    ? {
        sessionId: followUpSession.sessionId,
        version: followUpSession.version,
        questionId: followUpSession.question.id,
        followUpQuestionId: followUpSession.currentFollowUp.question.id,
      }
    : null

  const mainQuery = useQuery({
    enabled: mainInput !== null,
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
      if (!response) return mainInput === null ? false : 500
      const responseSession = getPracticeResponseSession(response)
      if (responseSession.status !== "answering") return false
      return responseSession.question.referenceAnswer.status === "generating" ? 500 : false
    },
    retry: true,
  })

  const followUpQuery = useQuery({
    enabled: followUpInput !== null,
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
      if (!response) return followUpInput === null ? false : 500
      const responseSession = getPracticeResponseSession(response)
      return responseSession.status === "answeringFollowUp" &&
        responseSession.currentFollowUp.question.referenceAnswer.status === "generating"
        ? 500
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
    referenceAnswerError: mainQuery.isError || followUpQuery.isError,
  }
}
