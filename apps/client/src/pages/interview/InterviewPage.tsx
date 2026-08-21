import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"

import { parseInterviewEntrySearch, toInterviewEntryParameters } from "@/app/training-entry-search"
import type { InterviewConfiguration, InterviewPageResponse } from "@/models/interview"
import type { InterviewTrainingEntryResolution } from "@/models/training-entry"
import {
  getInterviewPage,
  prepareInterviewTrainingEntry,
  startInterview,
} from "@/services/interview"

import { InterviewView } from "./InterviewView"
import { INTERVIEW_QUERY_KEY } from "./interview-query"

export function InterviewPage() {
  const navigate = useNavigate()
  const entrySearch = parseInterviewEntrySearch(useSearch({ strict: false }))
  const queryClient = useQueryClient()
  const startLock = useRef(false)
  const preparingEntryKey = useRef<string | null>(null)
  const entryKey = entrySearch.entry === undefined ? null : JSON.stringify(entrySearch)
  const [entryPreparation, setEntryPreparation] = useState<{
    key: string | null
    status: "idle" | "pending" | "success" | "error"
    resolution?: InterviewTrainingEntryResolution
  }>({ key: null, status: "idle" })
  const interviewQuery = useQuery({
    queryFn: getInterviewPage,
    queryKey: INTERVIEW_QUERY_KEY,
    retry: false,
  })
  const activeSessionId =
    interviewQuery.data?.session !== null &&
    interviewQuery.data?.session !== undefined &&
    interviewQuery.data.session.status !== "completed"
      ? interviewQuery.data.session.sessionId
      : null
  const activeSessionRecovery = useRef<string | null>(null)
  const startMutation = useMutation({
    mutationFn: startInterview,
    onSuccess: (response) => {
      queryClient.setQueryData<InterviewPageResponse>(INTERVIEW_QUERY_KEY, response)
    },
  })
  const prepareEntryMutation = useMutation({ mutationFn: prepareInterviewTrainingEntry })

  useEffect(() => {
    if (activeSessionId === null || activeSessionRecovery.current === activeSessionId) {
      return
    }

    activeSessionRecovery.current = activeSessionId
    void navigate({
      to: "/interview/session/$sessionId",
      params: { sessionId: activeSessionId },
      replace: true,
    })
  }, [activeSessionId, navigate])

  useEffect(() => {
    if (
      entryKey === null ||
      interviewQuery.data === undefined ||
      activeSessionId !== null ||
      preparingEntryKey.current === entryKey ||
      (entryPreparation.key === entryKey && entryPreparation.status === "success")
    ) {
      return
    }

    preparingEntryKey.current = entryKey
    setEntryPreparation({ key: entryKey, status: "pending" })
    void prepareEntryMutation
      .mutateAsync(toInterviewEntryParameters(entrySearch))
      .then(({ page, resolution }) => {
        queryClient.setQueryData<InterviewPageResponse>(INTERVIEW_QUERY_KEY, page)
        setEntryPreparation({ key: entryKey, status: "success", resolution })
      })
      .catch(() => setEntryPreparation({ key: entryKey, status: "error" }))
  }, [
    entryKey,
    entryPreparation,
    entrySearch,
    interviewQuery.data,
    activeSessionId,
    prepareEntryMutation,
    queryClient,
  ])

  async function handleStart(input: InterviewConfiguration) {
    if (startLock.current || startMutation.isPending) return

    startLock.current = true
    try {
      const response = await startMutation.mutateAsync(input)
      const session = response.session
      if (session === null) throw new Error("Started interview response is missing its session.")
      await navigate({
        to: "/interview/session/$sessionId",
        params: { sessionId: session.sessionId },
      })
    } finally {
      startLock.current = false
    }
  }

  function retryTrainingEntry() {
    preparingEntryKey.current = null
    setEntryPreparation({ key: null, status: "idle" })
  }

  const trainingEntryStatus =
    entryKey === null
      ? "inactive"
      : entryPreparation.key === entryKey
        ? entryPreparation.status
        : "pending"

  if (activeSessionId !== null) {
    return <InterviewView status="loading" />
  }

  if (trainingEntryStatus === "pending") {
    return <InterviewView status="loading" />
  }

  if (trainingEntryStatus === "error") {
    return (
      <InterviewView isRetrying={false} onRetry={retryTrainingEntry} status="trainingEntryError" />
    )
  }

  if (interviewQuery.data !== undefined) {
    if (interviewQuery.data.setup.availability.status === "blocked") {
      if (interviewQuery.data.setup.availability.reason === "noTargetRoles") {
        return <InterviewView status="empty" />
      }
      return (
        <InterviewView reason={interviewQuery.data.setup.availability.reason} status="blocked" />
      )
    }
    if (interviewQuery.data.setup.targetRoles.length === 0) {
      return <InterviewView status="empty" />
    }

    const trainingEntryResolution =
      entryPreparation.key === entryKey && entryPreparation.status === "success"
        ? entryPreparation.resolution
        : undefined
    return (
      <InterviewView
        trainingEntryResolution={trainingEntryResolution}
        isStarting={startMutation.isPending}
        onStart={handleStart}
        setup={interviewQuery.data.setup}
        status="ready"
      />
    )
  }

  if (interviewQuery.isFetching) {
    return <InterviewView status="loading" />
  }

  if (interviewQuery.isError) {
    return (
      <InterviewView
        isRetrying={interviewQuery.isFetching}
        onRetry={() => void interviewQuery.refetch()}
        status="error"
      />
    )
  }

  return <InterviewView status="loading" />
}
