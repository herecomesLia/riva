import { env } from "@/app/env"
import * as practiceMockService from "@/mocks/services/practice"
import {
  buildPracticeSetupContext,
  createDefaultPracticeSelection,
  reconcilePracticeSetupSelection,
} from "@/models/practice-setup"
import type {
  PracticeActiveSessionState,
  PracticeCompletedState,
  GetQuestionGenerationStatusInput,
  GetFollowUpGenerationStatusInput,
  GetPracticeReferenceAnswerStatusInput,
  GetPracticeFollowUpReferenceAnswerStatusInput,
  GetPracticeEvaluationStatusInput,
  EndPracticeFollowUpsInput,
  PracticeMutationResponse,
  PracticeServiceResponse,
  PracticePageResponse,
  PrepareNextPracticeSessionInput,
  RequestAnswerFrameworkInput,
  RequestEndPracticeSessionInput,
  RequestPracticeHintInput,
  RequestPracticeReferenceAnswerInput,
  RequestPracticeFollowUpFrameworkInput,
  RequestPracticeFollowUpHintInput,
  RequestPracticeFollowUpReferenceAnswerInput,
  RetryPracticeEvaluationInput,
  RetryCurrentPracticeQuestionInput,
  ContinueToNextPracticeQuestionInput,
  EndPracticeSessionInput,
  SetPracticeQuestionSavedInput,
  SetPracticeQuestionWeakInput,
  SkipPracticeQuestionInput,
  StartPracticeSessionInput,
  SubmitFollowUpAnswerInput,
  SubmitPrimaryAnswerInput,
} from "@/models/practice"
import type {
  PracticeActiveSessionWire,
  PracticeCompletedSessionWire,
  PracticeSetupCapabilitiesResponseWire,
  PracticeSessionResponseWire,
} from "@/schemas/practice"
import {
  currentPracticeSessionResponseSchema,
  practiceActiveSessionResponseSchema,
  practiceSetupCapabilitiesResponseSchema,
  practiceSessionResponseSchema,
} from "@/schemas/practice"
import { getRolesPage } from "@/services/roles"
import { apiRequest } from "@/services/api"
import type { RolesPageResponse } from "@/models/roles"
import type {
  PracticeTrainingEntryParameters,
  PracticeTrainingEntryPreparationResponse,
} from "@/models/training-entry"
import {
  resolvePracticeTrainingEntry,
  resolveTrainingEntryRoleAvailability,
} from "@/models/training-entry"

function realApiUnavailable(): never {
  throw new Error("Real practice API is not implemented.")
}

async function requestCurrentPracticeSession() {
  return currentPracticeSessionResponseSchema.parse(
    await apiRequest<unknown>("/practice/sessions/current"),
  )
}

async function requestPracticeSetupCapabilities(): Promise<PracticeSetupCapabilitiesResponseWire> {
  return practiceSetupCapabilitiesResponseSchema.parse(await apiRequest<unknown>("/practice/setup"))
}

function hasPracticeTrainingPrerequisites(rolesResponse: RolesPageResponse): boolean {
  return rolesResponse.profileContext.exists && rolesResponse.profileContext.completed
}

function getTrainablePracticeRoleIds(rolesResponse: RolesPageResponse): string[] {
  if (!hasPracticeTrainingPrerequisites(rolesResponse)) return []

  return rolesResponse.roles
    .filter(
      (role) =>
        role.preparationStatus !== "archived" &&
        role.jobDescription.status === "ready" &&
        role.jobDescriptionAnalysis !== null &&
        role.matchingAnalysis?.status === "current",
    )
    .map(({ id }) => id)
}

function createRealPracticeSetupSelection(setupContext: PracticePageResponse["setupContext"]) {
  return reconcilePracticeSetupSelection(setupContext, createDefaultPracticeSelection(setupContext))
}

function buildRealPracticeSetupContext(
  rolesResponse: RolesPageResponse,
  capabilities: PracticeSetupCapabilitiesResponseWire,
) {
  return buildPracticeSetupContext(rolesResponse, {
    canPrioritizeWeaknesses: capabilities.canPrioritizeWeaknesses,
    eligibleQuestionCounts: {
      history: capabilities.historyQuestionCount,
      saved: capabilities.savedQuestionCount,
    },
  })
}

async function requestPracticeActiveSession(
  path: string,
  options?: Parameters<typeof apiRequest>[1],
): Promise<PracticeActiveSessionState> {
  const response = practiceActiveSessionResponseSchema.parse(
    await apiRequest<unknown>(path, options),
  )
  return toPracticeActiveSessionState(response)
}

async function requestPracticeSession(
  path: string,
  options?: Parameters<typeof apiRequest>[1],
): Promise<PracticeActiveSessionState | PracticeCompletedState> {
  const response = practiceSessionResponseSchema.parse(await apiRequest<unknown>(path, options))
  return toPracticeSessionState(response)
}

export async function getPracticePage(): Promise<PracticePageResponse> {
  if (env.mock) return practiceMockService.getPracticePage()

  const [rolesResponse, currentResponse, capabilities] = await Promise.all([
    getRolesPage(),
    requestCurrentPracticeSession(),
    requestPracticeSetupCapabilities(),
  ])
  const setupContext = buildRealPracticeSetupContext(rolesResponse, capabilities)

  return {
    setupContext,
    session:
      currentResponse.session === null
        ? {
            status: "setup",
            selection: createRealPracticeSetupSelection(setupContext),
          }
        : toPracticeActiveSessionState(currentResponse.session),
  }
}

export async function startPracticeSession(
  input: StartPracticeSessionInput,
): Promise<PracticeActiveSessionState> {
  if (env.mock)
    return requireActivePracticeSession(await practiceMockService.startPracticeSession(input))
  return requestPracticeActiveSession("/practice/sessions", {
    json: input,
    method: "POST",
  })
}

export async function prepareNextPracticeSession(
  input: PrepareNextPracticeSessionInput,
): Promise<PracticePageResponse> {
  if (env.mock) return practiceMockService.prepareNextPracticeSession(input)

  const completedSession = await requestPracticeSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}`,
  )
  if (
    completedSession.status !== "completed" ||
    completedSession.sessionId !== input.sessionId ||
    completedSession.version !== input.version
  ) {
    throw new Error("The practice session is not the expected completed session.")
  }
  return getPracticePage()
}

export function preparePracticeTrainingEntry(
  input: PracticeTrainingEntryParameters,
): Promise<PracticeTrainingEntryPreparationResponse> {
  if (env.mock) return practiceMockService.preparePracticeTrainingEntry(input)

  return prepareRealPracticeTrainingEntry(input)
}

async function prepareRealPracticeTrainingEntry(
  input: PracticeTrainingEntryParameters,
): Promise<PracticeTrainingEntryPreparationResponse> {
  const [rolesResponse, currentResponse, capabilities] = await Promise.all([
    getRolesPage(),
    requestCurrentPracticeSession(),
    requestPracticeSetupCapabilities(),
  ])
  if (currentResponse.session !== null) {
    throw new Error("Cannot prepare a history entry while a practice session is active.")
  }

  const setupContext = buildRealPracticeSetupContext(rolesResponse, capabilities)
  const currentSelection = createRealPracticeSetupSelection(setupContext)
  const roleAvailability = resolveTrainingEntryRoleAvailability(
    rolesResponse.roles,
    getTrainablePracticeRoleIds(rolesResponse),
    input.targetRoleId,
    hasPracticeTrainingPrerequisites(rolesResponse),
  )
  const resolution = resolvePracticeTrainingEntry(
    setupContext,
    currentSelection,
    setupContext.canPrioritizeWeaknesses ? input : { ...input, prioritizeWeaknesses: false },
    roleAvailability,
  )

  return {
    page: {
      setupContext,
      session: {
        status: "setup",
        selection: resolution.configuration,
      },
    },
    resolution,
  }
}

export async function getQuestionGenerationStatus(
  input: GetQuestionGenerationStatusInput,
): Promise<PracticeActiveSessionState> {
  if (env.mock) {
    return requireActivePracticeSession(
      await practiceMockService.getQuestionGenerationStatus(input),
    )
  }
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/question-generation/refresh`,
    {
      json: { version: input.version },
      method: "POST",
    },
  )
}

export function getFollowUpGenerationStatus(
  input: GetFollowUpGenerationStatusInput,
): Promise<PracticeActiveSessionState> {
  if (env.mock) return realApiUnavailable()
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/follow-up-generation/refresh`,
    {
      json: { version: input.version },
      method: "POST",
    },
  )
}

export function getPracticeEvaluationStatus(
  input: GetPracticeEvaluationStatusInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.getPracticeEvaluationStatus(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/evaluation/refresh`,
    {
      json: { version: input.version },
      method: "POST",
    },
  )
}

export function retryPracticeEvaluation(
  input: RetryPracticeEvaluationInput,
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.retryPracticeEvaluation(input) : realApiUnavailable()
}

export function retryCurrentPracticeQuestion(
  input: RetryCurrentPracticeQuestionInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.retryCurrentPracticeQuestion(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/questions/retry`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
      },
      method: "POST",
    },
  )
}

export function continueToNextPracticeQuestion(
  input: ContinueToNextPracticeQuestionInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.continueToNextPracticeQuestion(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/questions/next`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
      },
      method: "POST",
    },
  )
}

export function endPracticeSession(
  input: EndPracticeSessionInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.endPracticeSession(input)
  return requestPracticeSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/complete`,
    {
      json: { version: input.version },
      method: "POST",
    },
  ).then((response) => {
    if (response.status !== "completed") {
      throw new Error("The complete endpoint must return a completed session.")
    }
    return response
  })
}

export function requestPracticeHint(
  input: RequestPracticeHintInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.requestPracticeHint(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/questions/hint`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
      },
      method: "POST",
    },
  )
}

export function requestAnswerFramework(
  input: RequestAnswerFrameworkInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.requestAnswerFramework(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/questions/framework`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
      },
      method: "POST",
    },
  )
}

export function requestPracticeReferenceAnswer(
  input: RequestPracticeReferenceAnswerInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.requestPracticeReferenceAnswer(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/questions/reference-answer`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
      },
      method: "POST",
    },
  )
}

export function getPracticeReferenceAnswerStatus(
  input: GetPracticeReferenceAnswerStatusInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return realApiUnavailable()
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/questions/reference-answer/refresh`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
      },
      method: "POST",
    },
  )
}

export function requestPracticeFollowUpHint(
  input: RequestPracticeFollowUpHintInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.requestPracticeFollowUpHint(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/follow-ups/hint`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
        followUpQuestionId: input.followUpQuestionId,
      },
      method: "POST",
    },
  )
}

export function requestPracticeFollowUpFramework(
  input: RequestPracticeFollowUpFrameworkInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.requestPracticeFollowUpFramework(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/follow-ups/framework`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
        followUpQuestionId: input.followUpQuestionId,
      },
      method: "POST",
    },
  )
}

export function requestPracticeFollowUpReferenceAnswer(
  input: RequestPracticeFollowUpReferenceAnswerInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.requestPracticeFollowUpReferenceAnswer(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/follow-ups/reference-answer`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
        followUpQuestionId: input.followUpQuestionId,
      },
      method: "POST",
    },
  )
}

export function getPracticeFollowUpReferenceAnswerStatus(
  input: GetPracticeFollowUpReferenceAnswerStatusInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return realApiUnavailable()
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/follow-ups/reference-answer/refresh`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
        followUpQuestionId: input.followUpQuestionId,
      },
      method: "POST",
    },
  )
}

export function setQuestionSaved(
  input: SetPracticeQuestionSavedInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.setQuestionSaved(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/questions/saved`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
        isSaved: input.isSaved,
      },
      method: "PATCH",
    },
  )
}

export function setQuestionWeak(
  input: SetPracticeQuestionWeakInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.setQuestionWeak(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/questions/weak`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
        isMarkedWeak: input.isMarkedWeak,
      },
      method: "PATCH",
    },
  )
}

export function submitPrimaryAnswer(
  input: SubmitPrimaryAnswerInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.submitPrimaryAnswer(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/answers/main`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
        content: input.content,
      },
      method: "POST",
    },
  )
}

export function submitFollowUpAnswer(
  input: SubmitFollowUpAnswerInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.submitFollowUpAnswer(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/answers/follow-up`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
        followUpQuestionId: input.followUpQuestionId,
        content: input.content,
      },
      method: "POST",
    },
  )
}

export function endPracticeFollowUps(
  input: EndPracticeFollowUpsInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.endPracticeFollowUps(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/follow-ups/end`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
        followUpQuestionId: input.followUpQuestionId,
      },
      method: "POST",
    },
  )
}

export function skipPracticeQuestion(
  input: SkipPracticeQuestionInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.skipPracticeQuestion(input)
  return requestPracticeActiveSession(
    `/practice/sessions/${encodeURIComponent(input.sessionId)}/questions/skip`,
    {
      json: {
        version: input.version,
        questionId: input.questionId,
      },
      method: "POST",
    },
  )
}

export function requestEndPracticeSession(
  input: RequestEndPracticeSessionInput,
): Promise<PracticeServiceResponse> {
  if (env.mock) return practiceMockService.requestEndPracticeSession(input)
  return requestPracticeSession(`/practice/sessions/${encodeURIComponent(input.sessionId)}/end`, {
    json: {
      version: input.version,
      questionId: input.questionId,
    },
    method: "POST",
  }).then((response) => {
    if (response.status !== "completed" || response.completionReason !== "userEndedEarly") {
      throw new Error("The end endpoint must return an early-completed session.")
    }
    return response
  })
}

export function toPracticeActiveSessionState(
  session: PracticeActiveSessionWire,
): PracticeActiveSessionState {
  const base = {
    attemptId: session.attemptId,
    attemptNumber: session.attemptNumber,
    attemptRecords: [],
    language: session.language,
    selection: session.selection,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    version: session.version,
  }

  switch (session.status) {
    case "generatingQuestion":
      return {
        ...base,
        previousAttempt: null,
        status: "generatingQuestion",
      }
    case "answering":
      return {
        ...base,
        question: session.question,
        status: "answering",
      }
    case "generatingFollowUp":
      return {
        ...base,
        followUpExchanges: session.followUpExchanges,
        mainAnswer: session.mainAnswer,
        question: session.question,
        status: "generatingFollowUp",
      }
    case "answeringFollowUp":
      return {
        ...base,
        currentFollowUp: session.currentFollowUp,
        followUpExchanges: session.followUpExchanges,
        mainAnswer: session.mainAnswer,
        question: session.question,
        status: "answeringFollowUp",
      }
    case "evaluating":
      return {
        ...base,
        followUpCompletion: session.followUpCompletion,
        followUpExchanges: session.followUpExchanges,
        mainAnswer: session.mainAnswer,
        question: session.question,
        status: "evaluating",
        submittedAt: session.submittedAt,
      }
    case "review":
      return {
        ...base,
        evaluation: session.evaluation,
        followUpCompletion: session.followUpCompletion,
        followUpExchanges: session.followUpExchanges,
        mainAnswer: session.mainAnswer,
        question: session.question,
        review: session.review,
        status: "review",
      }
  }
}

export function toPracticeCompletedSessionState(
  session: PracticeCompletedSessionWire,
): PracticeCompletedState {
  const base = {
    attemptId: session.attemptId,
    attemptNumber: session.attemptNumber,
    attemptRecords: [],
    completedAt: session.completedAt,
    completionReason: session.completionReason,
    finalAttemptAverageScore: session.finalAttemptAverageScore,
    language: session.language,
    markedWeakQuestionCount: session.markedWeakQuestionCount,
    nextStepSuggestion: session.nextStepSuggestion,
    questionsCompleted: session.questionsCompleted,
    retryCount: session.retryCount,
    savedQuestionCount: session.savedQuestionCount,
    selection: session.selection,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    status: "completed" as const,
    version: session.version,
  }
  if (session.completionReason === "reviewCompleted") {
    return {
      ...base,
      completionReason: session.completionReason,
      nextStepSuggestion: session.nextStepSuggestion,
      unfinishedAttempt: null,
    }
  }
  return {
    ...base,
    completionReason: session.completionReason,
    nextStepSuggestion: session.nextStepSuggestion,
    unfinishedAttempt: session.unfinishedAttempt,
  }
}

export function toPracticeSessionState(
  session: PracticeSessionResponseWire,
): PracticeActiveSessionState | PracticeCompletedState {
  return session.status === "completed"
    ? toPracticeCompletedSessionState(session)
    : toPracticeActiveSessionState(session)
}

function requireActivePracticeSession(
  response: PracticeServiceResponse,
): PracticeActiveSessionState {
  if (isActivePracticeSessionState(response)) return response
  if (
    "session" in response &&
    response.session.status !== "setup" &&
    response.session.status !== "completed"
  ) {
    return response.session
  }
  throw new Error("The practice session response is not active.")
}

function isActivePracticeSessionState(
  response: PracticeServiceResponse,
): response is PracticeActiveSessionState {
  return "status" in response
}
