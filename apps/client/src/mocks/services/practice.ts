import {
  createPracticeMockResponse,
  practiceAnswerFrameworkContent,
  practiceAnswerHintContent,
  type PracticeMockScenario,
} from "@/mocks/data/practice"
import { getRolesPage } from "@/mocks/services/roles"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  GetQuestionGenerationStatusInput,
  PracticePageResponse,
  PracticeQuestionMutationInput,
  PracticeQuestionType,
  RequestAnswerFrameworkInput,
  RequestEndPracticeSessionInput,
  RequestPracticeHintInput,
  SetPracticeQuestionSavedInput,
  SetPracticeQuestionWeakInput,
  SkipPracticeQuestionInput,
  PracticeSetupContext,
  PracticeSetupSelection,
  PracticeTargetRoleOption,
  StartPracticeSessionInput,
  SubmitPracticeAnswerInput,
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

function copy<T>(value: T): T {
  return structuredClone(value)
}

export function resetPracticeMockState(scenario: PracticeMockScenario = "setupReady") {
  mockResponse = createPracticeMockResponse(scenario)
  sessionSequence = 0
  mutationSequence = 0
  generationPollCounts.clear()
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

  return setMockResponse({
    ...current,
    session: {
      status: "generatingQuestion",
      sessionId: `practice_session_generated_${sessionSequence}`,
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

  const answeringFixture = createPracticeMockResponse("answeringQuestion")
  if (answeringFixture.session.status !== "answering") {
    throw new Error("The answering fixture must use the answering state.")
  }

  return {
    ...mockResponse,
    session: {
      ...answeringFixture.session,
      sessionId: currentSession.sessionId,
      version: currentSession.version + 1,
      selection: copy(currentSession.selection),
      startedAt: currentSession.startedAt,
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

  return setMockResponse({
    ...mockResponse,
    session: {
      ...session,
      version: session.version + 1,
      question: {
        ...session.question,
        answerHints: { status: "revealed", content: copy(practiceAnswerHintContent) },
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

  return setMockResponse({
    ...mockResponse,
    session: {
      ...session,
      version: session.version + 1,
      question: {
        ...session.question,
        answerFramework: {
          status: "revealed",
          content: copy(practiceAnswerFrameworkContent),
        },
      },
    },
  })
}

export async function setQuestionSaved(
  input: SetPracticeQuestionSavedInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)
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
  const session = requireCurrentQuestion(input)
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

export async function submitPracticeAnswer(
  input: SubmitPracticeAnswerInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)
  const content = input.content.trim()
  if (!content) throw new Error("Practice answer cannot be empty.")
  const submittedAt = nextMutationTimestamp()

  return setMockResponse({
    ...mockResponse,
    session: {
      ...session,
      status: "evaluating",
      version: session.version + 1,
      mainAnswer: {
        id: `${session.sessionId}_answer_1`,
        content,
        createdAt: submittedAt,
        order: 1,
      },
      followUpExchanges: [],
      submittedAt,
    },
  })
}

export async function skipPracticeQuestion(
  input: SkipPracticeQuestionInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)
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
