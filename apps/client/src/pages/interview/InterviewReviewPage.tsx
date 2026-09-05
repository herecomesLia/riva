import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"

import type { InterviewTrainingSuggestion } from "@/models/interview-workflow"
import { getInterviewReview } from "@/services/interview"

import { InterviewReviewView } from "./InterviewReviewView"

export function InterviewReviewPage() {
  const { sessionId } = useParams({ from: "/app/interview/review/$sessionId" })

  return <InterviewReviewContainer sessionId={sessionId} />
}

export function InterviewReviewContainer({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate()
  const reviewQuery = useQuery({
    queryFn: async () => {
      const review = await getInterviewReview(sessionId)
      if (review === null) throw new Error("Interview review is not available.")
      return review
    },
    queryKey: ["interview", "review", sessionId],
    retry: false,
  })

  function backToSetup() {
    void navigate({ to: "/interview" })
  }

  function startNextTraining(suggestion: InterviewTrainingSuggestion) {
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
