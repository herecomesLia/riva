import {
  candidateQuestionsPromptMock,
  createCandidateQuestionExchange,
  createInterviewAgentPlanMock,
  createInterviewMockResponse,
  createInterviewQuestionDetails,
  createInterviewReviewResponseMock,
  createInterviewSetupResponseMock,
  createInterviewSessionReview,
  interviewOpeningMessageMock,
  type InterviewAgentMockScenario,
  type InterviewMockScenario,
  type MockInterviewAgentPlan,
} from "@/mocks/data/interview"
import { getProfileMockSnapshot } from "@/mocks/services/profile"
import { getRolesMockSnapshot } from "@/mocks/services/roles"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  ActiveInterviewSessionResponse,
  BeginInterviewQuestionsInput,
  CompletedInterviewQuestionResponse,
  EndInterviewInput,
  FinishInterviewInput,
  GetInterviewReviewInput,
  GetInterviewReviewResponse,
  InterviewCandidateQuestionsSessionResponse,
  InterviewCompletionReason,
  InterviewCompletedSessionResponse,
  InterviewFollowUpSessionResponse,
  InterviewMutationResponse,
  InterviewPageResponse,
  InterviewProgressResponse,
  InterviewQuestionSessionResponse,
  InterviewQuestionRecordResponse,
  InterviewSessionMutationInput,
  StartInterviewInput,
  SubmitCandidateQuestionInput,
  SubmitInterviewAnswerInput,
} from "@/models/interview"

export type InterviewMockOperation =
  | "beginInterviewQuestions"
  | "endInterview"
  | "finishInterview"
  | "getInterviewPage"
  | "getInterviewReview"
  | "startInterview"
  | "submitCandidateQuestion"
  | "submitInterviewAnswer"

export type InterviewMockControllerOptions = {
  agentScenario?: InterviewAgentMockScenario
  defaultDelayMs?: number
  delayNext?: Partial<Record<InterviewMockOperation, number>>
  failNext?: readonly InterviewMockOperation[]
}

type PlanCursor = {
  mainQuestionIndex: number
  followUpIndex: number | null
}

let session = createInterviewMockResponse().session
let selectedAgentScenario: InterviewAgentMockScenario = "singleFollowUp"
let activePlan: MockInterviewAgentPlan = createInterviewAgentPlanMock(selectedAgentScenario)
let planCursor: PlanCursor | null = null
let sessionSequence = 0
let mutationSequence = 0
let configuredDefaultDelayMs: number | undefined
const delayedOperations = new Map<InterviewMockOperation, number>()
const failingOperations = new Set<InterviewMockOperation>()
const completedSessionSnapshots = new Map<string, InterviewCompletedSessionResponse>()

function copy<T>(value: T): T {
  return structuredClone(value)
}

function getSnapshot(): InterviewPageResponse {
  return copy({
    setup: createInterviewSetupResponseMock(getRolesMockSnapshot(), getProfileMockSnapshot()),
    session,
  })
}

function commit(nextSession: InterviewPageResponse["session"]): InterviewMutationResponse {
  session = nextSession
  if (nextSession?.status === "completed") {
    completedSessionSnapshots.set(nextSession.sessionId, copy(nextSession))
  }
  return getSnapshot()
}

function nextTimestamp() {
  mutationSequence += 1
  return new Date(Date.UTC(2026, 6, 24, 2, mutationSequence)).toISOString()
}

function nextId(prefix: string) {
  return `${prefix}-${mutationSequence + 1}`
}

async function consumeOperation(operation: InterviewMockOperation, fallbackDelayMs: number = 600) {
  const delayMs = delayedOperations.get(operation) ?? configuredDefaultDelayMs ?? fallbackDelayMs
  delayedOperations.delete(operation)
  if (delayMs > 0) await waitForMockDelay(delayMs)
  if (failingOperations.delete(operation)) {
    throw new Error(`Interview mock operation failed: ${operation}`)
  }
}

function requireActiveSession(
  input: InterviewSessionMutationInput,
): ActiveInterviewSessionResponse {
  if (session === null || session.status === "completed") {
    throw new Error("Interview session is not active.")
  }
  if (session.sessionId !== input.sessionId) {
    throw new Error("Interview session does not match the current session.")
  }
  if (session.version !== input.version) {
    throw new Error("Interview session is out of date.")
  }
  return session
}

function requirePlanCursor(): PlanCursor {
  if (planCursor === null) throw new Error("Interview Agent plan is not active.")
  return planCursor
}

function requireContent(content: string) {
  const normalized = content.trim()
  if (!normalized) throw new Error("Interview response content is required.")
  return normalized
}

function progressAfter(completedMainQuestions: number): InterviewProgressResponse {
  const latestChange = activePlan.planChanges
    .filter((change) => change.afterCompletedMainQuestions <= completedMainQuestions)
    .at(-1)
  return {
    completedMainQuestions,
    totalMainQuestions:
      latestChange?.totalMainQuestions ?? activePlan.initialProgress.totalMainQuestions,
    planRevision: latestChange?.planRevision ?? activePlan.initialProgress.planRevision,
  }
}

function toQuestionSession(
  session: ActiveInterviewSessionResponse,
  completedQuestions: CompletedInterviewQuestionResponse[],
  mainQuestionIndex: number,
): InterviewQuestionSessionResponse {
  const planned = activePlan.questions[mainQuestionIndex]
  if (planned === undefined) throw new Error("Interview Agent plan has no next main question.")
  planCursor = { mainQuestionIndex, followUpIndex: null }
  return {
    status: "question",
    sessionId: session.sessionId,
    version: session.version + 1,
    configuration: session.configuration,
    startedAt: session.startedAt,
    progress: progressAfter(completedQuestions.length),
    completedQuestions,
    currentQuestion: {
      status: "awaitingAnswer",
      question: copy(planned.question),
      answer: null,
    },
  }
}

function toCandidateQuestionsSession(
  session: ActiveInterviewSessionResponse,
  completedQuestions: CompletedInterviewQuestionResponse[],
): InterviewCandidateQuestionsSessionResponse {
  planCursor = null
  return {
    status: "candidateQuestions",
    sessionId: session.sessionId,
    version: session.version + 1,
    configuration: session.configuration,
    startedAt: session.startedAt,
    progress: progressAfter(completedQuestions.length),
    completedQuestions,
    prompt: candidateQuestionsPromptMock,
    exchanges: [],
  }
}

function afterCompletedMainQuestion(
  session: ActiveInterviewSessionResponse,
  completedQuestions: CompletedInterviewQuestionResponse[],
  currentMainQuestionIndex: number,
) {
  const nextMainQuestionIndex = currentMainQuestionIndex + 1
  return activePlan.questions[nextMainQuestionIndex] === undefined
    ? toCandidateQuestionsSession(session, completedQuestions)
    : toQuestionSession(session, completedQuestions, nextMainQuestionIndex)
}

export function resetInterviewMockState(
  scenario: InterviewMockScenario = "setupReady",
  controller: InterviewMockControllerOptions = {},
) {
  const delayedEntries = Object.entries(controller.delayNext ?? {})
  if (
    (controller.defaultDelayMs !== undefined && controller.defaultDelayMs < 0) ||
    delayedEntries.some(([, delayMs]) => delayMs !== undefined && delayMs < 0)
  ) {
    throw new Error("Interview mock delay must not be negative.")
  }

  session = createInterviewMockResponse(scenario).session
  selectedAgentScenario = controller.agentScenario ?? "singleFollowUp"
  activePlan = createInterviewAgentPlanMock(selectedAgentScenario)
  planCursor = null
  sessionSequence = 0
  mutationSequence = 0
  configuredDefaultDelayMs = controller.defaultDelayMs
  delayedOperations.clear()
  failingOperations.clear()
  completedSessionSnapshots.clear()
  if (session?.status === "completed") {
    completedSessionSnapshots.set(session.sessionId, copy(session))
  }

  for (const operation of controller.failNext ?? []) failingOperations.add(operation)
  for (const [operation, delayMs] of delayedEntries) {
    if (delayMs !== undefined) {
      delayedOperations.set(operation as InterviewMockOperation, delayMs)
    }
  }
}

export async function getInterviewPage(): Promise<InterviewPageResponse> {
  await consumeOperation("getInterviewPage")
  return getSnapshot()
}

export async function startInterview(
  input: StartInterviewInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("startInterview")
  const setup = createInterviewSetupResponseMock(getRolesMockSnapshot(), getProfileMockSnapshot())
  if (setup.availability.status === "blocked") {
    throw new Error(`Interview prerequisite is not met: ${setup.availability.reason}.`)
  }
  const targetRole = setup.targetRoles.find(({ id }) => id === input.targetRoleId)
  if (targetRole === undefined) throw new Error("Interview target role does not exist.")
  if (!targetRole.supportedRounds.includes(input.round)) {
    throw new Error("Interview round is not supported by the target role.")
  }
  if (!setup.availableDurationMinutes.includes(input.durationMinutes)) {
    throw new Error("Interview duration preference is not available.")
  }

  activePlan = createInterviewAgentPlanMock(selectedAgentScenario)
  planCursor = null
  sessionSequence += 1
  return commit({
    status: "opening",
    sessionId: `mock-interview-session-${sessionSequence}`,
    version: 1,
    configuration: copy(input),
    startedAt: nextTimestamp(),
    progress: progressAfter(0),
    completedQuestions: [],
    openingMessage: interviewOpeningMessageMock,
  })
}

export async function beginInterviewQuestions(
  input: BeginInterviewQuestionsInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("beginInterviewQuestions")
  const session = requireActiveSession(input)
  if (session.status !== "opening") {
    throw new Error("Interview opening has already finished.")
  }
  return commit(toQuestionSession(session, [], 0))
}

export async function submitInterviewAnswer(
  input: SubmitInterviewAnswerInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("submitInterviewAnswer")
  const session = requireActiveSession(input)
  const cursor = requirePlanCursor()
  const content = requireContent(input.content)
  const planned = activePlan.questions[cursor.mainQuestionIndex]
  if (planned === undefined) throw new Error("Interview Agent plan position is invalid.")

  if (input.target === "question") {
    if (session.status !== "question") {
      throw new Error("Interview is not awaiting a main answer.")
    }
    if (session.currentQuestion.question.id !== input.questionId || cursor.followUpIndex !== null) {
      throw new Error("Interview question does not match the authoritative session.")
    }
    const answer = {
      id: nextId("interview-answer"),
      content,
      submittedAt: nextTimestamp(),
    }
    const firstFollowUp = planned.followUps[0]
    if (firstFollowUp !== undefined) {
      planCursor = { ...cursor, followUpIndex: 0 }
      return commit({
        status: "followUp",
        sessionId: session.sessionId,
        version: session.version + 1,
        configuration: session.configuration,
        startedAt: session.startedAt,
        progress: session.progress,
        completedQuestions: session.completedQuestions,
        currentQuestion: {
          question: session.currentQuestion.question,
          answer,
          answeredFollowUps: [],
        },
        currentFollowUp: {
          status: "awaitingAnswer",
          question: copy(firstFollowUp),
          answer: null,
        },
      })
    }

    const completedQuestions = [
      ...session.completedQuestions,
      {
        question: session.currentQuestion.question,
        answer,
        followUps: [],
        completedAt: nextTimestamp(),
      },
    ]
    return commit(afterCompletedMainQuestion(session, completedQuestions, cursor.mainQuestionIndex))
  }

  if (
    session.status !== "followUp" ||
    cursor.followUpIndex === null ||
    session.currentQuestion.question.id !== input.questionId ||
    session.currentFollowUp.question.id !== input.followUpQuestionId
  ) {
    throw new Error("Interview follow-up does not match the authoritative session.")
  }
  const answeredFollowUp = {
    status: "answered" as const,
    question: session.currentFollowUp.question,
    answer: {
      id: nextId("interview-follow-up-answer"),
      content,
      submittedAt: nextTimestamp(),
    },
  }
  const answeredFollowUps = [...session.currentQuestion.answeredFollowUps, answeredFollowUp]
  const nextFollowUpIndex = cursor.followUpIndex + 1
  const nextFollowUp = planned.followUps[nextFollowUpIndex]
  if (nextFollowUp !== undefined) {
    planCursor = { ...cursor, followUpIndex: nextFollowUpIndex }
    const next: InterviewFollowUpSessionResponse = {
      ...session,
      version: session.version + 1,
      currentQuestion: {
        ...session.currentQuestion,
        answeredFollowUps,
      },
      currentFollowUp: {
        status: "awaitingAnswer",
        question: copy(nextFollowUp),
        answer: null,
      },
    }
    return commit(next)
  }

  const completedQuestions = [
    ...session.completedQuestions,
    {
      question: session.currentQuestion.question,
      answer: session.currentQuestion.answer,
      followUps: answeredFollowUps,
      completedAt: nextTimestamp(),
    },
  ]
  return commit(afterCompletedMainQuestion(session, completedQuestions, cursor.mainQuestionIndex))
}

export async function submitCandidateQuestion(
  input: SubmitCandidateQuestionInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("submitCandidateQuestion")
  const session = requireActiveSession(input)
  if (session.status !== "candidateQuestions") {
    throw new Error("Interview is not in the candidate question stage.")
  }
  const content = requireContent(input.content)
  return commit({
    ...session,
    version: session.version + 1,
    exchanges: [
      ...session.exchanges,
      createCandidateQuestionExchange(content, session.exchanges.length + 1),
    ],
  })
}

export async function finishInterview(
  input: FinishInterviewInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("finishInterview")
  const session = requireActiveSession(input)
  if (session.status !== "candidateQuestions") {
    throw new Error("Interview can only finish after entering candidate questions.")
  }
  return commit(
    toCompletedSession(
      session,
      session.completedQuestions,
      session.exchanges,
      "formalQuestionsCompleted",
    ),
  )
}

function toCompletedSession(
  session: ActiveInterviewSessionResponse,
  completedQuestions: CompletedInterviewQuestionResponse[],
  candidateQuestionExchanges: InterviewCandidateQuestionsSessionResponse["exchanges"],
  completionReason: InterviewCompletionReason,
  questionRecords: InterviewQuestionRecordResponse[] = completedQuestions.map(
    ({ answer, followUps, question }) => ({
      status: "answered",
      question,
      answer,
      followUps,
    }),
  ),
): InterviewCompletedSessionResponse {
  const review = createInterviewSessionReview(completedQuestions, completionReason)
  return {
    status: "completed",
    sessionId: session.sessionId,
    version: session.version + 1,
    configuration: session.configuration,
    startedAt: session.startedAt,
    progress: progressAfter(completedQuestions.length),
    completedQuestions,
    completionReason,
    completedAt: nextTimestamp(),
    candidateQuestionExchanges,
    review,
    questionDetails: createInterviewQuestionDetails(questionRecords, review),
  }
}

export async function endInterview(input: EndInterviewInput): Promise<InterviewMutationResponse> {
  await consumeOperation("endInterview")
  const session = requireActiveSession(input)
  let completedQuestions = session.completedQuestions
  let questionRecords: InterviewQuestionRecordResponse[] = completedQuestions.map(
    ({ answer, followUps, question }) => ({
      status: "answered",
      question,
      answer,
      followUps,
    }),
  )

  if (session.status === "question") {
    questionRecords = [
      ...questionRecords,
      {
        status: "unanswered",
        question: session.currentQuestion.question,
        answer: null,
        followUps: [],
      },
    ]
  } else if (session.status === "followUp") {
    completedQuestions = [
      ...completedQuestions,
      {
        question: session.currentQuestion.question,
        answer: session.currentQuestion.answer,
        followUps: session.currentQuestion.answeredFollowUps,
        completedAt: nextTimestamp(),
      },
    ]
    questionRecords = [
      ...questionRecords,
      {
        status: "answered",
        question: session.currentQuestion.question,
        answer: session.currentQuestion.answer,
        followUps: [
          ...session.currentQuestion.answeredFollowUps,
          {
            status: "unanswered",
            question: session.currentFollowUp.question,
            answer: null,
          },
        ],
      },
    ]
  }
  const exchanges = session.status === "candidateQuestions" ? session.exchanges : []
  const completionReason =
    session.status === "candidateQuestions" ? "formalQuestionsCompleted" : "userEndedEarly"
  planCursor = null
  return commit(
    toCompletedSession(session, completedQuestions, exchanges, completionReason, questionRecords),
  )
}

export async function getInterviewReview(
  input: GetInterviewReviewInput,
): Promise<GetInterviewReviewResponse> {
  await consumeOperation("getInterviewReview")
  const session = completedSessionSnapshots.get(input.sessionId)
  if (session === undefined) {
    throw new Error("Interview review is not available.")
  }
  return copy(createInterviewReviewResponseMock(session))
}
