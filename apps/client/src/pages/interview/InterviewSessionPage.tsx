import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useRef, useState } from "react"

import type { InterviewSession, InterviewData } from "@/models/interview-workflow"
import {
  beginInterviewQuestions,
  endInterview,
  finishInterview,
  getInterviewPage,
  submitCandidateQuestion,
  submitInterviewAnswer,
} from "@/services/interview"

import { InterviewSessionView, type InterviewSessionSummary } from "./InterviewSessionView"
import { INTERVIEW_QUERY_KEY } from "./interview-query"

export function InterviewSessionPage() {
  const { sessionId } = useParams({ from: "/app/interview/session/$sessionId" })

  return <InterviewSessionContainer sessionId={sessionId} />
}

export function InterviewSessionContainer({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const beginLock = useRef(false)
  const submitLock = useRef(false)
  const candidateQuestionLock = useRef(false)
  const finishLock = useRef(false)
  const endLock = useRef(false)
  const [beginFailed, setBeginFailed] = useState(false)

  const interviewQuery = useQuery({
    queryFn: getInterviewPage,
    queryKey: INTERVIEW_QUERY_KEY,
    retry: false,
  })
  const beginMutation = useMutation({ mutationFn: beginInterviewQuestions })
  const submitMutation = useMutation({ mutationFn: submitInterviewAnswer })
  const candidateQuestionMutation = useMutation({ mutationFn: submitCandidateQuestion })
  const finishMutation = useMutation({ mutationFn: finishInterview })
  const endMutation = useMutation({ mutationFn: endInterview })

  function commit(session: InterviewSession | null) {
    queryClient.setQueryData<InterviewData>(INTERVIEW_QUERY_KEY, (current) =>
      current === undefined ? current : { ...current, session },
    )
  }

  async function commitAndOpenReview(session: InterviewSession | null) {
    commit(session)
    if (session?.status !== "completed") throw new Error("Expected completed interview.")
    await navigate({
      to: "/interview/review/$sessionId",
      params: { sessionId: session.sessionId },
    })
  }

  async function backToSetup() {
    await navigate({ to: "/interview" })
  }

  function currentSession(): Exclude<InterviewSession, { status: "completed" }> {
    const current = queryClient.getQueryData<InterviewData>(INTERVIEW_QUERY_KEY)?.session
    if (current === null || current === undefined || current.status === "completed") {
      throw new Error("Interview session is not active.")
    }
    if (current.sessionId !== sessionId) {
      throw new Error("Interview session does not match the route.")
    }
    return current
  }

  async function handleBegin() {
    if (beginLock.current || beginMutation.isPending || endLock.current || endMutation.isPending) {
      return
    }
    const session = currentSession()
    if (session.status !== "opening") return

    beginLock.current = true
    setBeginFailed(false)
    try {
      commit(await beginMutation.mutateAsync())
    } catch {
      setBeginFailed(true)
    } finally {
      beginLock.current = false
    }
  }

  async function handleSubmit(content: string) {
    if (
      submitLock.current ||
      submitMutation.isPending ||
      endLock.current ||
      endMutation.isPending
    ) {
      return
    }
    const session = currentSession()
    if (session.status !== "question" && session.status !== "followUp") return

    submitLock.current = true
    try {
      commit(await submitMutation.mutateAsync(content))
    } finally {
      submitLock.current = false
    }
  }

  async function handleCandidateQuestion(content: string) {
    if (candidateQuestionLock.current || candidateQuestionMutation.isPending) return
    const session = currentSession()
    if (session.status !== "candidateQuestions") return

    candidateQuestionLock.current = true
    try {
      commit(await candidateQuestionMutation.mutateAsync(content))
    } finally {
      candidateQuestionLock.current = false
    }
  }

  async function handleFinish() {
    if (finishLock.current || finishMutation.isPending) return
    const session = currentSession()
    if (session.status !== "candidateQuestions") return

    finishLock.current = true
    try {
      const response = await finishMutation.mutateAsync()
      await commitAndOpenReview(response)
    } finally {
      finishLock.current = false
    }
  }

  async function handleEnd() {
    if (
      endLock.current ||
      endMutation.isPending ||
      beginLock.current ||
      beginMutation.isPending ||
      submitLock.current ||
      submitMutation.isPending
    ) {
      return
    }
    currentSession()

    endLock.current = true
    try {
      const response = await endMutation.mutateAsync()
      await commitAndOpenReview(response)
    } finally {
      endLock.current = false
    }
  }

  const data = interviewQuery.data
  if (data === undefined) {
    if (interviewQuery.isError) {
      return (
        <InterviewSessionView
          isRetrying={interviewQuery.isFetching}
          onBack={() => void backToSetup()}
          onRetry={() => void interviewQuery.refetch()}
          status="error"
        />
      )
    }
    return <InterviewSessionView status="loading" />
  }

  const session = data.session
  if (session === null || session.sessionId !== sessionId) {
    return (
      <InterviewSessionView
        onBack={() => void backToSetup()}
        reason="missing"
        status="unavailable"
      />
    )
  }
  if (session.status === "completed") {
    return (
      <InterviewSessionView
        onBack={() =>
          void navigate({
            to: "/interview/review/$sessionId",
            params: { sessionId },
          })
        }
        reason="completed"
        status="unavailable"
      />
    )
  }

  const targetRole = data.setup.targetRoles.find(
    ({ id }) => id === session.configuration.targetRoleId,
  )
  if (targetRole === undefined) {
    return (
      <InterviewSessionView
        onBack={() => void backToSetup()}
        reason="missing"
        status="unavailable"
      />
    )
  }

  const summary = toSummary(session, targetRole.title, targetRole.company)
  if (session.status === "opening") {
    return (
      <InterviewSessionView
        beginFailed={beginFailed}
        isBeginning={beginMutation.isPending}
        isEnding={endMutation.isPending}
        isInteractionLocked={beginMutation.isPending || endMutation.isPending}
        onBegin={handleBegin}
        onEnd={handleEnd}
        openingMessage={session.openingMessage}
        status="opening"
        summary={summary}
      />
    )
  }

  if (session.status === "candidateQuestions") {
    return (
      <InterviewSessionView
        exchanges={session.exchanges}
        history={session.history}
        isFinishing={finishMutation.isPending}
        isInteractionLocked={candidateQuestionMutation.isPending || finishMutation.isPending}
        isSubmittingQuestion={candidateQuestionMutation.isPending}
        onFinish={handleFinish}
        onSubmitQuestion={handleCandidateQuestion}
        prompt={session.prompt}
        status="candidateQuestions"
        summary={summary}
      />
    )
  }

  return (
    <InterviewSessionView
      isEnding={endMutation.isPending}
      isInteractionLocked={submitMutation.isPending || endMutation.isPending}
      isSubmitting={submitMutation.isPending}
      history={session.history}
      onEnd={handleEnd}
      onSubmit={handleSubmit}
      prompt={session.prompt}
      status="question"
      summary={summary}
    />
  )
}

function toSummary(
  session: Exclude<InterviewSession, { status: "completed" }>,
  targetRole: string,
  company: string | null,
): InterviewSessionSummary {
  return {
    targetRole,
    company,
    round: session.configuration.round,
    difficulty: session.configuration.difficulty,
    completedMainQuestions: session.progress.completedMainQuestions,
    totalMainQuestions: session.progress.totalMainQuestions,
    planAdjusted: session.progress.planAdjusted,
  }
}
