import { createPracticeMockResponse, type PracticeMockScenario } from "@/mocks/data/practice"
import { getRolesPage } from "@/mocks/services/roles"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  GetQuestionGenerationStatusInput,
  PracticePageResponse,
  PracticeQuestionType,
  PracticeSetupContext,
  PracticeTargetRoleOption,
  StartPracticeSessionInput,
} from "@/models/practice"
import type { TargetRole } from "@/models/roles"

const allQuestionTypes: PracticeQuestionType[] = [
  "projectDeepDive",
  "behavioral",
  "businessUnderstanding",
  "motivation",
  "technicalFoundation",
]

const practiceRoleMetadata = new Map(
  createPracticeMockResponse().setupContext.targetRoles.map((role) => [
    role.id,
    role.supportedQuestionTypes,
  ]),
)

let mockResponse = createPracticeMockResponse()
let sessionSequence = 0
const generationPollCounts = new Map<string, number>()

function copy<T>(value: T): T {
  return structuredClone(value)
}

export function resetPracticeMockState(scenario: PracticeMockScenario = "setupReady") {
  mockResponse = createPracticeMockResponse(scenario)
  sessionSequence = 0
  generationPollCounts.clear()
}

function toPracticeRoleOption(role: TargetRole): PracticeTargetRoleOption {
  return {
    id: role.id,
    title: role.title,
    company: role.company,
    supportedQuestionTypes: copy(practiceRoleMetadata.get(role.id) ?? allQuestionTypes),
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

function withSetupContext(setupContext: PracticeSetupContext): PracticePageResponse {
  if (mockResponse.session.status !== "setup") {
    return { ...mockResponse, setupContext }
  }

  const selectedRoleExists = setupContext.targetRoles.some(
    (role) => role.id === mockResponse.session.selection.targetRoleId,
  )

  return {
    ...mockResponse,
    setupContext,
    session: {
      ...mockResponse.session,
      selection: {
        ...mockResponse.session.selection,
        targetRoleId: selectedRoleExists
          ? mockResponse.session.selection.targetRoleId
          : setupContext.defaultTargetRoleId,
      },
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
