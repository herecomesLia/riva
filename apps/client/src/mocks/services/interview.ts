import {
  candidateQuestionsPromptMock,
  createCandidateQuestionExchange,
  createInterviewAgentPlanMock,
  createInterviewCompletedSessionMock,
  createInterviewCompletedSessionResponseMock,
  createInterviewMockResponse,
  createInterviewQuestionDetails,
  createInterviewReviewResponseMock,
  createInterviewSetupResponseMock,
  createInterviewSessionReview,
  defaultInterviewConfigurationMock,
  interviewOpeningMessageMock,
  interviewSetupConfigurationMock,
  type InterviewAgentMockScenario,
  type InterviewMockScenario,
  type MockInterviewCompletedSession,
  type MockInterviewAgentPlan,
} from "@/mocks/data/interview"
import {
  clearCompletedInterviewSessions,
  getCompletedInterviewSession,
  listCompletedInterviewSessions,
  saveCompletedInterviewSession,
} from "@/mocks/repositories/interview"
import { saveTrainingRecordSnapshot } from "@/mocks/repositories/training-records"
import { getProfileMockSnapshot } from "@/mocks/services/profile"
import { getRolesMockSnapshot } from "@/mocks/services/roles"
import { resetTrainingRecordsMockState } from "@/mocks/services/training-records"
import { createMockInterviewRecordSnapshot } from "@/mocks/training-record-snapshots"
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
  InterviewCompletionResponse,
  InterviewCompletionReason,
  InterviewFollowUpSessionResponse,
  InterviewMutationResponse,
  InterviewPageResponse,
  InterviewProgressResponse,
  InterviewQuestionSessionResponse,
  InterviewQuestionRecordResponse,
  InterviewReviewGenerationStatus,
  InterviewSessionMutationInput,
  StartInterviewInput,
  SubmitCandidateQuestionInput,
  SubmitInterviewAnswerInput,
} from "@/models/interview"
import {
  resolveInterviewTrainingEntry,
  resolveTrainingEntryRoleAvailability,
  type InterviewTrainingEntryPreparationResponse,
  type InterviewTrainingEntryParameters,
} from "@/models/training-entry"

export type InterviewMockOperation =
  | "beginInterviewQuestions"
  | "endInterview"
  | "finishInterview"
  | "getInterviewPage"
  | "getInterviewReview"
  | "prepareInterviewTrainingEntry"
  | "startInterview"
  | "submitCandidateQuestion"
  | "submitInterviewAnswer"

export type InterviewMockControllerOptions = {
  agentScenario?: InterviewAgentMockScenario
  clearPersistedSessions?: boolean
  defaultDelayMs?: number
  delayNext?: Partial<Record<InterviewMockOperation, number>>
  failNext?: readonly InterviewMockOperation[]
  reviewGenerationFailure?: boolean
}

type PlanCursor = {
  mainQuestionIndex: number
  followUpIndex: number | null
}

let session = createInterviewMockResponse().session
let preparedConfiguration: InterviewPageResponse["setup"]["defaultConfiguration"] | null = null
let selectedAgentScenario: InterviewAgentMockScenario = "singleFollowUp"
let activePlan: MockInterviewAgentPlan = createInterviewAgentPlanMock({
  ...defaultInterviewConfigurationMock,
  scenario: selectedAgentScenario,
})
let planCursor: PlanCursor | null = null
let sessionSequence = getPersistedSessionSequence()
let mutationSequence = 0
let configuredDefaultDelayMs: number | undefined
let selectedReviewGenerationFailure = false
const delayedOperations = new Map<InterviewMockOperation, number>()
const failingOperations = new Set<InterviewMockOperation>()
const pendingReviewPolls = new Map<string, number>()
const failedReviewSessionIds = new Set<string>()

function copy<T>(value: T): T {
  return structuredClone(value)
}

function getPersistedSessionSequence() {
  return listCompletedInterviewSessions().reduce((highest, { sessionId }) => {
    const match = /^mock-interview-session-(\d+)$/.exec(sessionId)
    return match === null ? highest : Math.max(highest, Number(match[1]))
  }, 0)
}

function getSnapshot(): InterviewPageResponse {
  const rolesSnapshot = getRolesMockSnapshot()
  const setup = createInterviewSetupResponseMock(rolesSnapshot, getProfileMockSnapshot())
  return copy({
    setup:
      preparedConfiguration === null
        ? setup
        : {
            ...setup,
            defaultConfiguration: copy(preparedConfiguration),
          },
    session,
  })
}

function commit(nextSession: InterviewPageResponse["session"]): InterviewMutationResponse {
  session = copy(nextSession)
  return getSnapshot()
}

function saveInterviewTrainingRecord(completedSession: MockInterviewCompletedSession) {
  saveTrainingRecordSnapshot(
    createMockInterviewRecordSnapshot({
      setup: getSnapshot().setup,
      session: completedSession,
    }),
  )
}

function updateCurrentReviewStatus(
  sessionId: string,
  reviewStatus: InterviewReviewGenerationStatus,
) {
  if (session?.status !== "completed" || session.sessionId !== sessionId) return
  session = { ...session, reviewStatus }
}

function commitCompletion(
  completedSession: MockInterviewCompletedSession,
): InterviewCompletionResponse {
  saveCompletedInterviewSession(completedSession)
  const isImmediatelyUnavailable = completedSession.review.status === "unavailable"
  const completedSummary = {
    ...createInterviewCompletedSessionResponseMock(completedSession),
    reviewStatus: isImmediatelyUnavailable ? ("unavailable" as const) : ("generating" as const),
  }
  session = copy(completedSummary)
  failedReviewSessionIds.delete(completedSession.sessionId)
  if (isImmediatelyUnavailable) {
    pendingReviewPolls.delete(completedSession.sessionId)
    saveInterviewTrainingRecord(completedSession)
  } else {
    pendingReviewPolls.set(completedSession.sessionId, 1)
  }
  return copy({ session: completedSummary })
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

  if (controller.clearPersistedSessions ?? true) {
    clearCompletedInterviewSessions()
  }
  resetTrainingRecordsMockState()
  session = createInterviewMockResponse(scenario).session
  preparedConfiguration = null
  selectedAgentScenario = controller.agentScenario ?? "singleFollowUp"
  activePlan = createInterviewAgentPlanMock({
    ...defaultInterviewConfigurationMock,
    scenario: selectedAgentScenario,
  })
  planCursor = null
  sessionSequence = getPersistedSessionSequence()
  mutationSequence = 0
  configuredDefaultDelayMs = controller.defaultDelayMs
  selectedReviewGenerationFailure = controller.reviewGenerationFailure ?? false
  delayedOperations.clear()
  failingOperations.clear()
  pendingReviewPolls.clear()
  failedReviewSessionIds.clear()
  if (scenario === "completed") {
    const completedSession = createInterviewCompletedSessionMock()
    session = createInterviewCompletedSessionResponseMock(completedSession)
    saveCompletedInterviewSession(completedSession)
    saveInterviewTrainingRecord(completedSession)
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

export async function prepareInterviewTrainingEntry(
  input: InterviewTrainingEntryParameters,
): Promise<InterviewTrainingEntryPreparationResponse> {
  await consumeOperation("prepareInterviewTrainingEntry", 0)
  const rolesSnapshot = getRolesMockSnapshot()
  const snapshot = getSnapshot()
  const roleAvailability = resolveTrainingEntryRoleAvailability(
    rolesSnapshot.roles,
    snapshot.setup.targetRoles.map(({ id }) => id),
    input.targetRoleId,
    snapshot.setup.availability.status === "available",
  )
  const resolution = resolveInterviewTrainingEntry(snapshot.setup, input, roleAvailability)
  preparedConfiguration = resolution.configuration
  session = null
  planCursor = null
  return { page: getSnapshot(), resolution }
}

export async function startInterview(
  input: StartInterviewInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("startInterview")
  const rolesSnapshot = getRolesMockSnapshot()
  const profileSnapshot = getProfileMockSnapshot()
  const setup = createInterviewSetupResponseMock(rolesSnapshot, profileSnapshot)
  const targetRole = rolesSnapshot.roles.find(({ id }) => id === input.targetRoleId)
  if (targetRole === undefined) throw new Error("Interview target role does not exist.")
  if (targetRole.status === "archived") {
    throw new Error("Interview target role is archived.")
  }
  const supportedRounds =
    interviewSetupConfigurationMock.supportedRoundsByTargetRoleId[
      input.targetRoleId as keyof typeof interviewSetupConfigurationMock.supportedRoundsByTargetRoleId
    ]
  if (supportedRounds === undefined) {
    throw new Error("Interview target role has no complete question catalog.")
  }
  if (targetRole.jobDescription.status !== "ready") {
    throw new Error("Interview target role job description is not ready.")
  }
  const profileComplete =
    profileSnapshot.profile?.status === "active" &&
    profileSnapshot.profile.completeness.percentage === 100
  if (!profileComplete) {
    throw new Error("Interview prerequisite is not met: profileIncomplete.")
  }
  if (!supportedRounds.includes(input.round)) {
    throw new Error("Interview round is not supported by the target role.")
  }
  if (!setup.availableDifficulties.includes(input.difficulty)) {
    throw new Error("Interview difficulty preference is not available.")
  }
  if (!setup.availableDurationMinutes.includes(input.durationMinutes)) {
    throw new Error("Interview duration preference is not available.")
  }

  preparedConfiguration = copy(input)
  activePlan = createInterviewAgentPlanMock({ ...input, scenario: selectedAgentScenario })
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
): Promise<InterviewCompletionResponse> {
  await consumeOperation("finishInterview")
  const session = requireActiveSession(input)
  if (session.status !== "candidateQuestions") {
    throw new Error("Interview can only finish after entering candidate questions.")
  }
  return commitCompletion(
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
): MockInterviewCompletedSession {
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

export async function endInterview(input: EndInterviewInput): Promise<InterviewCompletionResponse> {
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
  return commitCompletion(
    toCompletedSession(session, completedQuestions, exchanges, completionReason, questionRecords),
  )
}

export async function getInterviewReview(
  input: GetInterviewReviewInput,
): Promise<GetInterviewReviewResponse> {
  await consumeOperation("getInterviewReview")
  const session = getCompletedInterviewSession(input.sessionId)
  if (session === null) {
    throw new Error("Interview review is not available.")
  }
  if (failedReviewSessionIds.has(session.sessionId)) {
    return {
      status: "failed",
      sessionId: session.sessionId,
      completionReason: session.completionReason,
      reason: "generationFailed",
    }
  }
  const remainingPolls = pendingReviewPolls.get(session.sessionId)
  if (remainingPolls !== undefined && remainingPolls > 0) {
    pendingReviewPolls.set(session.sessionId, remainingPolls - 1)
    return {
      status: "generating",
      sessionId: session.sessionId,
      completionReason: session.completionReason,
    }
  }
  if (remainingPolls !== undefined) {
    pendingReviewPolls.delete(session.sessionId)
    if (selectedReviewGenerationFailure) {
      failedReviewSessionIds.add(session.sessionId)
      updateCurrentReviewStatus(session.sessionId, "failed")
      return {
        status: "failed",
        sessionId: session.sessionId,
        completionReason: session.completionReason,
        reason: "generationFailed",
      }
    }
  }
  updateCurrentReviewStatus(session.sessionId, session.review.status)
  saveInterviewTrainingRecord(session)
  return copy(createInterviewReviewResponseMock(session))
}
