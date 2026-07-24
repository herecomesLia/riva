import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"

import type { InterviewTrainingSuggestionResponse } from "@/models/interview"
import { getInterviewReview } from "@/services/interview"

import { InterviewReviewView } from "./InterviewReviewView"

export function InterviewReviewPage() {
  const { sessionId } = useParams({ from: "/app/interview/review/$sessionId" })

  return <InterviewReviewContainer sessionId={sessionId} />
}

export function InterviewReviewContainer({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate()
  const reviewQuery = useQuery({
    queryFn: () => getInterviewReview({ sessionId }),
    queryKey: ["interview", "review", sessionId],
    retry: false,
  })

  function backToSetup() {
    void navigate({ to: "/interview" })
  }

  function startNextTraining(suggestion: InterviewTrainingSuggestionResponse) {
    void navigate({ to: suggestion.action === "targetedPractice" ? "/practice" : "/interview" })
  }

  if (reviewQuery.data !== undefined) {
    if (reviewQuery.data.questionOverviews.length === 0) {
      return <InterviewReviewView onBack={backToSetup} status="empty" />
    }
    return (
      <InterviewReviewView
        data={reviewQuery.data}
        onBack={backToSetup}
        onNextTraining={startNextTraining}
        status="ready"
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
