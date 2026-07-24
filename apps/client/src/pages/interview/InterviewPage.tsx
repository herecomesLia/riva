import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useRef } from "react"

import { parseInterviewEntrySearch } from "@/app/training-entry-search"
import { applyInterviewEntrySearch } from "@/app/training-entry-defaults"
import type { InterviewConfiguration, InterviewPageResponse } from "@/models/interview"
import { getInterviewPage, startInterview } from "@/services/interview"

import { InterviewView } from "./InterviewView"
import { INTERVIEW_QUERY_KEY } from "./interview-query"

export function InterviewPage() {
  const navigate = useNavigate()
  const entrySearch = parseInterviewEntrySearch(useSearch({ strict: false }))
  const queryClient = useQueryClient()
  const startLock = useRef(false)
  const interviewQuery = useQuery({
    queryFn: getInterviewPage,
    queryKey: INTERVIEW_QUERY_KEY,
    retry: false,
  })
  const startMutation = useMutation({
    mutationFn: startInterview,
    onSuccess: (response) => {
      queryClient.setQueryData<InterviewPageResponse>(INTERVIEW_QUERY_KEY, response)
    },
  })

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

  if (interviewQuery.data !== undefined) {
    if (interviewQuery.data.setup.availability.status === "blocked") {
      return (
        <InterviewView reason={interviewQuery.data.setup.availability.reason} status="blocked" />
      )
    }
    if (interviewQuery.data.setup.targetRoles.length === 0) {
      return <InterviewView status="empty" />
    }

    const setup = applyInterviewEntrySearch(interviewQuery.data.setup, entrySearch)
    return (
      <InterviewView
        isStarting={startMutation.isPending}
        onStart={handleStart}
        setup={setup}
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
