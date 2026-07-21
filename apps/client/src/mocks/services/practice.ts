import {
  createGeneratedPracticeQuestion,
  createGeneratedPracticeQuestionGuidance,
  createPracticeMockEvaluationResult,
  createPracticeFollowUpQuestion,
  createPracticeMockResponse,
  getPracticeFollowUpPrompts,
  type PracticeMockScenario,
} from "@/mocks/data/practice"
import { getRolesPage } from "@/mocks/services/roles"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  GetQuestionGenerationStatusInput,
  GetPracticeEvaluationStatusInput,
  EndPracticeFollowUpsInput,
  PracticePageResponse,
  PracticeQuestionMutationInput,
  PracticeQuestionType,
  RequestAnswerFrameworkInput,
  RequestEndPracticeSessionInput,
  RequestPracticeHintInput,
  RetryPracticeEvaluationInput,
  SetPracticeQuestionSavedInput,
  SetPracticeQuestionWeakInput,
  SkipPracticeQuestionInput,
  PracticeSetupContext,
  PracticeSetupSelection,
  PracticeTargetRoleOption,
  StartPracticeSessionInput,
  SubmitFollowUpAnswerInput,
  SubmitPrimaryAnswerInput,
} from "@/models/practice"
import type { TargetRole } from "@/models/roles"

const commonQuestionTypes: PracticeQuestionType[] = [
  "projectDeepDive",
  "behavioral",
  "businessUnderstanding",
  "motivation",
]

const practiceRoleMetadata = new Map(
  createPracticeMockResponse().setupContext.targetRoles.map((role) => [
    role.id,
    role.supportedQuestionTypes,
  ]),
)

let mockResponse = createPracticeMockResponse()
let sessionSequence = 0
let mutationSequence = 0
const generationPollCounts = new Map<string, number>()
const evaluationPollCounts = new Map<string, number>()
const questionOrdinals = new Map<string, number>()

function copy<T>(value: T): T {
  return structuredClone(value)
}

export function resetPracticeMockState(scenario: PracticeMockScenario = "setupReady") {
  mockResponse = createPracticeMockResponse(scenario)
  sessionSequence = 0
  mutationSequence = 0
  generationPollCounts.clear()
  evaluationPollCounts.clear()
  questionOrdinals.clear()
}

function toPracticeRoleOption(role: TargetRole): PracticeTargetRoleOption {
  return {
    id: role.id,
    title: role.title,
    company: role.company,
    supportedQuestionTypes: copy(practiceRoleMetadata.get(role.id) ?? commonQuestionTypes),
  }
}

async function getCurrentSetupContext(): Promise<PracticeSetupContext> {
  const rolesResponse = await getRolesPage()
  const targetRoles = rolesResponse.roles
    .filter((role) => role.preparationStatus !== "archived")
    .map(toPracticeRoleOption)
  const defaultTargetRoleId = targetRoles.some((role) => role.id === rolesResponse.currentRoleId)
    ? rolesResponse.currentRoleId
    : null

  return {
    targetRoles,
    defaultTargetRoleId,
    eligibleQuestionCounts: copy(mockResponse.setupContext.eligibleQuestionCounts),
  }
}

export function reconcilePracticeSetupSelection(
  context: PracticeSetupContext,
  selection: PracticeSetupSelection,
): PracticeSetupSelection {
  const defaultRole = context.targetRoles.find((role) => role.id === context.defaultTargetRoleId)
  const selectedRole = defaultRole
    ? defaultRole
    : (context.targetRoles.find((role) => role.id === selection.targetRoleId) ??
      context.targetRoles[0])

  if (!selectedRole) return { ...selection, targetRoleId: null }

  return {
    ...selection,
    targetRoleId: selectedRole.id,
    questionType: selectedRole.supportedQuestionTypes.includes(selection.questionType)
      ? selection.questionType
      : (selectedRole.supportedQuestionTypes[0] ?? selection.questionType),
  }
}

function withSetupContext(setupContext: PracticeSetupContext): PracticePageResponse {
  if (mockResponse.session.status !== "setup") {
    return { ...mockResponse, setupContext }
  }

  return {
    ...mockResponse,
    setupContext,
    session: {
      ...mockResponse.session,
      selection: reconcilePracticeSetupSelection(setupContext, mockResponse.session.selection),
    },
  }
}

function setMockResponse(response: PracticePageResponse) {
  mockResponse = copy(response)
  return copy(mockResponse)
}

export async function getPracticePage(): Promise<PracticePageResponse> {
  const setupContext = await getCurrentSetupContext()
  return setMockResponse(withSetupContext(setupContext))
}

function requireValidSelection(
  setupContext: PracticeSetupContext,
  input: StartPracticeSessionInput,
) {
  const role = setupContext.targetRoles.find((candidate) => candidate.id === input.targetRoleId)
  if (!role) throw new Error("Target role was not found.")
  if (!role.supportedQuestionTypes.includes(input.questionType)) {
    throw new Error("Question type is not supported by the selected role.")
  }
  if (input.source === "saved" && setupContext.eligibleQuestionCounts.saved === 0) {
    throw new Error("No eligible saved questions are available.")
  }
  if (input.source === "history" && setupContext.eligibleQuestionCounts.history === 0) {
    throw new Error("No eligible history questions are available.")
  }
}

export async function startPracticeSession(
  input: StartPracticeSessionInput,
): Promise<PracticePageResponse> {
  const current = await getPracticePage()
  requireValidSelection(current.setupContext, input)
  sessionSequence += 1
  const sessionId = `practice_session_generated_${sessionSequence}`
  questionOrdinals.set(sessionId, 0)

  return setMockResponse({
    ...current,
    session: {
      status: "generatingQuestion",
      sessionId,
      version: 1,
      selection: copy(input),
      startedAt: new Date(Date.UTC(2026, 6, 20, 2, sessionSequence)).toISOString(),
    },
  })
}

function completeQuestionGeneration(): PracticePageResponse {
  const currentSession = mockResponse.session
  if (currentSession.status !== "generatingQuestion") {
    throw new Error("Practice session is not generating a question.")
  }

  const ordinal = (questionOrdinals.get(currentSession.sessionId) ?? 0) + 1
  const question = createGeneratedPracticeQuestion({
    sessionId: currentSession.sessionId,
    ordinal,
    selection: currentSession.selection,
  })
  questionOrdinals.set(currentSession.sessionId, ordinal)

  return {
    ...mockResponse,
    session: {
      status: "answering",
      sessionId: currentSession.sessionId,
      version: currentSession.version + 1,
      selection: copy(currentSession.selection),
      startedAt: currentSession.startedAt,
      question,
    },
  }
}

export async function getQuestionGenerationStatus(
  input: GetQuestionGenerationStatusInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const currentSession = mockResponse.session

  if (
    currentSession.status !== "generatingQuestion" ||
    currentSession.sessionId !== input.sessionId ||
    currentSession.version !== input.version
  ) {
    throw new Error("Practice session version is out of date.")
  }

  const pollCount = (generationPollCounts.get(input.sessionId) ?? 0) + 1
  generationPollCounts.set(input.sessionId, pollCount)

  if (pollCount < 2) return copy(mockResponse)
  return setMockResponse(completeQuestionGeneration())
}

function requireCurrentQuestion(input: PracticeQuestionMutationInput) {
  const session = mockResponse.session
  if (
    session.status !== "answering" ||
    session.sessionId !== input.sessionId ||
    session.version !== input.version ||
    session.question.id !== input.questionId
  ) {
    throw new Error("Practice question version is out of date.")
  }
  return session
}

function requireCurrentFollowUp(
  input: PracticeQuestionMutationInput & { followUpQuestionId: string },
) {
  const session = mockResponse.session
  if (
    session.status !== "answeringFollowUp" ||
    session.sessionId !== input.sessionId ||
    session.version !== input.version ||
    session.question.id !== input.questionId ||
    session.currentFollowUp.question.id !== input.followUpQuestionId
  ) {
    throw new Error("Practice follow-up version is out of date.")
  }
  return session
}

function requireCurrentReviewableQuestion(input: PracticeQuestionMutationInput) {
  const session = mockResponse.session
  if (
    (session.status !== "answering" && session.status !== "review") ||
    session.sessionId !== input.sessionId ||
    session.version !== input.version ||
    session.question.id !== input.questionId
  ) {
    throw new Error("Practice question version is out of date.")
  }
  return session
}

function nextMutationTimestamp() {
  mutationSequence += 1
  return new Date(Date.UTC(2026, 6, 20, 3, mutationSequence)).toISOString()
}

export async function requestPracticeHint(
  input: RequestPracticeHintInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)
  if (session.question.answerHints.status !== "notRequested") return copy(mockResponse)
  const guidance = createGeneratedPracticeQuestionGuidance(session.question.questionType)

  return setMockResponse({
    ...mockResponse,
    session: {
      ...session,
      version: session.version + 1,
      question: {
        ...session.question,
        answerHints: { status: "revealed", content: copy(guidance.hints) },
      },
    },
  })
}

export async function requestAnswerFramework(
  input: RequestAnswerFrameworkInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)
  if (session.question.answerFramework.status !== "notRequested") return copy(mockResponse)
  const guidance = createGeneratedPracticeQuestionGuidance(session.question.questionType)

  return setMockResponse({
    ...mockResponse,
    session: {
      ...session,
      version: session.version + 1,
      question: {
        ...session.question,
        answerFramework: {
          status: "revealed",
          content: copy(guidance.framework),
        },
      },
    },
  })
}

export async function setQuestionSaved(
  input: SetPracticeQuestionSavedInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentReviewableQuestion(input)
  if (session.question.isSaved === input.isSaved) return copy(mockResponse)

  return setMockResponse({
    ...mockResponse,
    session: {
      ...session,
      version: session.version + 1,
      question: { ...session.question, isSaved: input.isSaved },
    },
  })
}

export async function setQuestionWeak(
  input: SetPracticeQuestionWeakInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentReviewableQuestion(input)
  if (session.question.isMarkedWeak === input.isMarkedWeak) return copy(mockResponse)

  return setMockResponse({
    ...mockResponse,
    session: {
      ...session,
      version: session.version + 1,
      question: { ...session.question, isMarkedWeak: input.isMarkedWeak },
    },
  })
}

export async function submitPrimaryAnswer(
  input: SubmitPrimaryAnswerInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)
  const content = input.content.trim()
  if (!content) throw new Error("Practice answer cannot be empty.")
  const submittedAt = nextMutationTimestamp()

  const mainAnswer = {
    id: `${session.sessionId}_answer_1`,
    content,
    createdAt: submittedAt,
    order: 1,
  }
  const followUpPrompts = getPracticeFollowUpPrompts(session.question.questionType)
  const firstPrompt = followUpPrompts[0]

  if (!firstPrompt) {
    return setMockResponse({
      ...mockResponse,
      session: {
        ...session,
        status: "evaluating",
        version: session.version + 1,
        mainAnswer,
        followUpExchanges: [],
        followUpCompletion: { status: "completed", reason: "noFollowUpRequired" },
        submittedAt,
      },
    })
  }

  return setMockResponse({
    ...mockResponse,
    session: {
      ...session,
      status: "answeringFollowUp",
      version: session.version + 1,
      mainAnswer,
      followUpExchanges: [],
      currentFollowUp: {
        status: "awaitingAnswer",
        question: createPracticeFollowUpQuestion({
          question: session.question,
          order: 1,
          createdAt: submittedAt,
        }),
        answer: null,
      },
    },
  })
}

export async function submitFollowUpAnswer(
  input: SubmitFollowUpAnswerInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentFollowUp(input)
  const content = input.content.trim()
  if (!content) throw new Error("Practice follow-up answer cannot be empty.")
  const submittedAt = nextMutationTimestamp()
  const answeredExchange = {
    status: "answered" as const,
    question: copy(session.currentFollowUp.question),
    answer: {
      id: `${session.sessionId}_answer_${session.currentFollowUp.question.order + 1}`,
      content,
      createdAt: submittedAt,
      order: session.currentFollowUp.question.order + 1,
    },
  }
  const followUpExchanges = [...session.followUpExchanges, answeredExchange]
  const prompts = getPracticeFollowUpPrompts(session.question.questionType)
  const nextOrder = session.currentFollowUp.question.order + 1
  const nextPrompt = prompts[nextOrder - 1]

  if (!nextPrompt) {
    return setMockResponse({
      ...mockResponse,
      session: {
        status: "evaluating",
        sessionId: session.sessionId,
        version: session.version + 1,
        selection: copy(session.selection),
        startedAt: session.startedAt,
        question: copy(session.question),
        mainAnswer: copy(session.mainAnswer),
        followUpExchanges,
        followUpCompletion: { status: "completed", reason: "allAnswered" },
        submittedAt,
      },
    })
  }

  return setMockResponse({
    ...mockResponse,
    session: {
      ...session,
      version: session.version + 1,
      followUpExchanges,
      currentFollowUp: {
        status: "awaitingAnswer",
        question: createPracticeFollowUpQuestion({
          question: session.question,
          order: nextOrder,
          createdAt: submittedAt,
        }),
        answer: null,
      },
    },
  })
}

export async function endPracticeFollowUps(
  input: EndPracticeFollowUpsInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentFollowUp(input)

  return setMockResponse({
    ...mockResponse,
    session: {
      status: "evaluating",
      sessionId: session.sessionId,
      version: session.version + 1,
      selection: copy(session.selection),
      startedAt: session.startedAt,
      question: copy(session.question),
      mainAnswer: copy(session.mainAnswer),
      followUpExchanges: copy(session.followUpExchanges),
      followUpCompletion: {
        status: "endedEarly",
        unansweredQuestion: copy(session.currentFollowUp.question),
      },
      submittedAt: nextMutationTimestamp(),
    },
  })
}

function evaluationAttemptKey(sessionId: string, version: number) {
  return `${sessionId}:${version}`
}

function requireEvaluatingSession(input: GetPracticeEvaluationStatusInput) {
  const session = mockResponse.session
  if (
    session.status !== "evaluating" ||
    session.sessionId !== input.sessionId ||
    session.version !== input.version ||
    session.question.id !== input.questionId
  ) {
    throw new Error("Practice evaluation version is out of date.")
  }
  return session
}

export async function getPracticeEvaluationStatus(
  input: GetPracticeEvaluationStatusInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireEvaluatingSession(input)
  const attemptKey = evaluationAttemptKey(session.sessionId, session.version)
  const pollCount = (evaluationPollCounts.get(attemptKey) ?? 0) + 1
  evaluationPollCounts.set(attemptKey, pollCount)
  if (pollCount < 2) return copy(mockResponse)

  const result = createPracticeMockEvaluationResult()
  return setMockResponse({
    ...mockResponse,
    session: {
      status: "review",
      sessionId: session.sessionId,
      version: session.version + 1,
      selection: copy(session.selection),
      startedAt: session.startedAt,
      question: copy(session.question),
      mainAnswer: copy(session.mainAnswer),
      followUpExchanges: copy(session.followUpExchanges),
      followUpCompletion: copy(session.followUpCompletion),
      evaluation: result.evaluation,
      review: result.review,
    },
  })
}

export async function retryPracticeEvaluation(
  input: RetryPracticeEvaluationInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireEvaluatingSession(input)
  const nextVersion = session.version + 1
  evaluationPollCounts.set(evaluationAttemptKey(session.sessionId, nextVersion), 0)

  return setMockResponse({
    ...mockResponse,
    session: {
      ...session,
      version: nextVersion,
    },
  })
}

export async function skipPracticeQuestion(
  input: SkipPracticeQuestionInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)
  if (!questionOrdinals.has(session.sessionId)) questionOrdinals.set(session.sessionId, 1)
  generationPollCounts.set(session.sessionId, 0)

  return setMockResponse({
    ...mockResponse,
    session: {
      status: "generatingQuestion",
      sessionId: session.sessionId,
      version: session.version + 1,
      selection: copy(session.selection),
      startedAt: session.startedAt,
    },
  })
}

export async function requestEndPracticeSession(
  input: RequestEndPracticeSessionInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)

  return setMockResponse({
    ...mockResponse,
    session: {
      status: "completed",
      sessionId: session.sessionId,
      version: session.version + 1,
      selection: copy(session.selection),
      startedAt: session.startedAt,
      completedAt: nextMutationTimestamp(),
      questionsCompleted: 0,
    },
  })
}
