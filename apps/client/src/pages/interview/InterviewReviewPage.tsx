import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useEffect, useRef } from "react"

import { dashboardQueryKeys } from "@/app/dashboard-query"
import { trainingRecordQueryKeys } from "@/app/training-record-query"
import type { InterviewPageResponse, InterviewTrainingSuggestionResponse } from "@/models/interview"
import { getInterviewReview } from "@/services/interview"

import { InterviewReviewView } from "./InterviewReviewView"
import { INTERVIEW_QUERY_KEY } from "./interview-query"

export function InterviewReviewPage() {
  const { sessionId } = useParams({ from: "/app/interview/review/$sessionId" })

  return <InterviewReviewContainer sessionId={sessionId} />
}

export function InterviewReviewContainer({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const synchronizedTerminalReview = useRef<string | null>(null)
  const reviewQuery = useQuery({
    queryFn: () => getInterviewReview({ sessionId }),
    queryKey: ["interview", "review", sessionId],
    refetchInterval: (query) => (query.state.data?.status === "generating" ? 1_000 : false),
    retry: false,
  })

  useEffect(() => {
    const review = reviewQuery.data
    if (review === undefined) return

    queryClient.setQueryData<InterviewPageResponse>(INTERVIEW_QUERY_KEY, (current) => {
      const currentSession = current?.session
      if (
        current === undefined ||
        currentSession?.status !== "completed" ||
        currentSession.sessionId !== review.sessionId
      ) {
        return current
      }
      return {
        ...current,
        session: { ...currentSession, reviewStatus: review.status },
      }
    })

    if (review.status === "generating") return
    const terminalKey = `${review.sessionId}:${review.status}`
    if (synchronizedTerminalReview.current === terminalKey) return
    synchronizedTerminalReview.current = terminalKey
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: trainingRecordQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all }),
    ])
  }, [queryClient, reviewQuery.data])

  function backToSetup() {
    void navigate({ to: "/interview" })
  }

  function startNextTraining(suggestion: InterviewTrainingSuggestionResponse) {
    void navigate({ to: suggestion.action === "targetedPractice" ? "/practice" : "/interview" })
  }

  if (reviewQuery.data !== undefined) {
    if (reviewQuery.data.status === "generating") {
      return <InterviewReviewView data={reviewQuery.data} status="generating" />
    }
    if (reviewQuery.data.status === "failed") {
      return <InterviewReviewView data={reviewQuery.data} onBack={backToSetup} status="failed" />
    }
    if (reviewQuery.data.status === "unavailable") {
      return (
        <InterviewReviewView data={reviewQuery.data} onBack={backToSetup} status="unavailable" />
      )
    }
    if (reviewQuery.data.status === "partial") {
      return <InterviewReviewView data={reviewQuery.data} onBack={backToSetup} status="partial" />
    }
    return (
      <InterviewReviewView
        data={reviewQuery.data}
        onBack={backToSetup}
        onNextTraining={startNextTraining}
        status="complete"
      />
    )
  }
  if (reviewQuery.isError) {
    return (
      <InterviewReviewView
        isRetrying={reviewQuery.isFetching}
        onBack={backToSetup}
        onRetry={() => void reviewQuery.refetch()}
        status="error"
      />
    )
  }
  return <InterviewReviewView status="loading" />
}
