import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useRef, useState } from "react"

import type {
  ActiveInterviewSessionResponse,
  GetNextInterviewQuestionInput,
  InterviewConversationRecordViewData,
  InterviewMutationResponse,
  InterviewPageResponse,
  InterviewSessionResponse,
  SubmitInterviewAnswerInput,
} from "@/models/interview"
import {
  beginInterviewQuestions,
  endInterview,
  finishInterview,
  getInterviewPage,
  getNextInterviewQuestion,
  submitCandidateQuestion,
  submitInterviewAnswer,
} from "@/services/interview"

import {
  InterviewSessionView,
  type InterviewPromptViewData,
  type InterviewSessionSummary,
} from "./InterviewSessionView"
import { INTERVIEW_QUERY_KEY } from "./interview-query"

type AdvanceState = {
  promptId: string
  status: "advancing" | "failed"
}

export function InterviewSessionPage() {
  const { sessionId } = useParams({ from: "/app/interview/session/$sessionId" })

  return <InterviewSessionContainer sessionId={sessionId} />
}

export function InterviewSessionContainer({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const beginLock = useRef(false)
  const submitLock = useRef(false)
  const advanceLock = useRef(false)
  const candidateQuestionLock = useRef(false)
  const finishLock = useRef(false)
  const endLock = useRef(false)
  const [beginFailed, setBeginFailed] = useState(false)
  const [advanceState, setAdvanceState] = useState<AdvanceState | null>(null)

  const interviewQuery = useQuery({
    queryFn: getInterviewPage,
    queryKey: INTERVIEW_QUERY_KEY,
    retry: false,
  })
  const beginMutation = useMutation({ mutationFn: beginInterviewQuestions })
  const submitMutation = useMutation({ mutationFn: submitInterviewAnswer })
  const advanceMutation = useMutation({ mutationFn: getNextInterviewQuestion })
  const candidateQuestionMutation = useMutation({ mutationFn: submitCandidateQuestion })
  const finishMutation = useMutation({ mutationFn: finishInterview })
  const endMutation = useMutation({ mutationFn: endInterview })

  function commit(response: InterviewMutationResponse) {
    queryClient.setQueryData<InterviewPageResponse>(INTERVIEW_QUERY_KEY, response)
  }

  async function backToSetup() {
    await navigate({ to: "/interview" })
  }

  function currentSession(): ActiveInterviewSessionResponse {
    const current = queryClient.getQueryData<InterviewPageResponse>(INTERVIEW_QUERY_KEY)?.session
    if (current === null || current === undefined || current.status === "completed") {
      throw new Error("Interview session is not active.")
    }
    if (current.sessionId !== sessionId) {
      throw new Error("Interview session does not match the route.")
    }
    return current
  }

  async function handleBegin() {
    if (beginLock.current || beginMutation.isPending) return
    const session = currentSession()
    if (session.status !== "opening") return

    beginLock.current = true
    setBeginFailed(false)
    try {
      commit(
        await beginMutation.mutateAsync({
          sessionId: session.sessionId,
          version: session.version,
        }),
      )
    } catch {
      setBeginFailed(true)
    } finally {
      beginLock.current = false
    }
  }

  function toAdvanceInput(session: ActiveInterviewSessionResponse): GetNextInterviewQuestionInput {
    if (session.status === "question" && session.currentQuestion.status === "answered") {
      return {
        target: "question",
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.currentQuestion.question.id,
      }
    }
    if (session.status === "followUp" && session.currentFollowUp.status === "answered") {
      return {
        target: "followUp",
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.currentQuestion.question.id,
        followUpQuestionId: session.currentFollowUp.question.id,
      }
    }
    throw new Error("Interview answer is not ready to advance.")
  }

  function answeredPromptId(session: ActiveInterviewSessionResponse) {
    if (session.status === "question" && session.currentQuestion.status === "answered") {
      return session.currentQuestion.question.id
    }
    if (session.status === "followUp" && session.currentFollowUp.status === "answered") {
      return session.currentFollowUp.question.id
    }
    throw new Error("Interview answer is not ready to advance.")
  }

  async function advance(session: ActiveInterviewSessionResponse) {
    if (advanceLock.current || advanceMutation.isPending) return
    const promptId = answeredPromptId(session)

    advanceLock.current = true
    setAdvanceState({ promptId, status: "advancing" })
    try {
      commit(await advanceMutation.mutateAsync(toAdvanceInput(session)))
      setAdvanceState(null)
    } catch {
      setAdvanceState({ promptId, status: "failed" })
    } finally {
      advanceLock.current = false
    }
  }

  async function handleSubmit(content: string) {
    if (submitLock.current || submitMutation.isPending) return
    const session = currentSession()
    let input: SubmitInterviewAnswerInput

    if (session.status === "question" && session.currentQuestion.status === "awaitingAnswer") {
      input = {
        target: "question",
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.currentQuestion.question.id,
        content,
      }
    } else if (
      session.status === "followUp" &&
      session.currentFollowUp.status === "awaitingAnswer"
    ) {
      input = {
        target: "followUp",
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.currentQuestion.question.id,
        followUpQuestionId: session.currentFollowUp.question.id,
        content,
      }
    } else {
      return
    }

    submitLock.current = true
    try {
      commit(await submitMutation.mutateAsync(input))
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
      commit(
        await candidateQuestionMutation.mutateAsync({
          sessionId: session.sessionId,
          version: session.version,
          content,
        }),
      )
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
      const response = await finishMutation.mutateAsync({
        sessionId: session.sessionId,
        version: session.version,
      })
      commit(response)
      await navigate({
        to: "/interview/review/$sessionId",
        params: { sessionId: session.sessionId },
      })
    } finally {
      finishLock.current = false
    }
  }

  async function handleEnd() {
    if (endLock.current || endMutation.isPending) return
    const session = currentSession()

    endLock.current = true
    try {
      commit(
        await endMutation.mutateAsync({
          sessionId: session.sessionId,
          version: session.version,
        }),
      )
      await backToSetup()
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
  const history = toConversationHistory(session)
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
        history={history}
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

  const prompt = toPrompt(session)
  const advanceStatus =
    prompt.answer === null
      ? "idle"
      : advanceState?.promptId === prompt.id
        ? advanceState.status
        : "ready"

  return (
    <InterviewSessionView
      advanceStatus={advanceStatus}
      isEnding={endMutation.isPending}
      isInteractionLocked={
        submitMutation.isPending || advanceMutation.isPending || endMutation.isPending
      }
      isSubmitting={submitMutation.isPending}
      history={history}
      onEnd={handleEnd}
      onRetryAdvance={() => void advance(currentSession())}
      onSubmit={handleSubmit}
      prompt={prompt}
      status="question"
      summary={summary}
    />
  )
}

function toSummary(
  session: InterviewSessionResponse,
  targetRole: string,
  company: string | null,
): InterviewSessionSummary {
  return {
    targetRole,
    company,
    round: session.configuration.round,
    difficulty: session.configuration.difficulty,
    completedQuestions: session.progress.completedQuestions,
    totalQuestions: session.progress.totalQuestions,
  }
}

function toPrompt(
  session: Exclude<ActiveInterviewSessionResponse, { status: "opening" | "candidateQuestions" }>,
): InterviewPromptViewData {
  if (session.status === "question") {
    return {
      id: session.currentQuestion.question.id,
      kind: "question",
      content: session.currentQuestion.question.prompt,
      questionOrder: session.currentQuestion.question.order,
      answer: session.currentQuestion.answer?.content ?? null,
    }
  }
  return {
    id: session.currentFollowUp.question.id,
    kind: "followUp",
    content: session.currentFollowUp.question.prompt,
    questionOrder: session.currentQuestion.question.order,
    answer: session.currentFollowUp.answer?.content ?? null,
  }
}

function toConversationHistory(
  session: ActiveInterviewSessionResponse,
): InterviewConversationRecordViewData[] {
  const records = session.completedQuestions.flatMap(({ answer, followUps, question }) => [
    {
      id: question.id,
      kind: "question" as const,
      questionOrder: question.order,
      prompt: question.prompt,
      answer: answer.content,
    },
    ...followUps.map(({ answer: followUpAnswer, question: followUp }) => ({
      id: followUp.id,
      kind: "followUp" as const,
      questionOrder: question.order,
      prompt: followUp.prompt,
      answer: followUpAnswer.content,
    })),
  ])

  if (session.status === "followUp") {
    records.push({
      id: session.currentQuestion.question.id,
      kind: "question",
      questionOrder: session.currentQuestion.question.order,
      prompt: session.currentQuestion.question.prompt,
      answer: session.currentQuestion.answer.content,
    })
  }

  return records
}
