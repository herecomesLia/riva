import { env } from "@/app/env"
import * as practiceMockService from "@/mocks/services/practice"
import { buildPracticeSetupContext, createDefaultPracticeSelection } from "@/models/practice-setup"
import type {
  PracticeActiveSessionState,
  PracticeCompletedState,
  GetQuestionGenerationStatusInput,
  GetFollowUpGenerationStatusInput,
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
  PracticeSessionResponseWire,
} from "@/schemas/practice"
import {
  currentPracticeSessionResponseSchema,
  practiceActiveSessionResponseSchema,
  practiceSessionResponseSchema,
} from "@/schemas/practice"
import { getRolesPage } from "@/services/roles"
import { apiRequest } from "@/services/api"
import type {
  PracticeTrainingEntryParameters,
  PracticeTrainingEntryPreparationResponse,
} from "@/models/training-entry"

function realApiUnavailable(): never {
  throw new Error("Real practice API is not implemented.")
}

async function requestCurrentPracticeSession() {
  return currentPracticeSessionResponseSchema.parse(
    await apiRequest<unknown>("/practice/sessions/current"),
  )
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

  const [rolesResponse, currentResponse] = await Promise.all([
    getRolesPage(),
    requestCurrentPracticeSession(),
  ])
  const setupContext = buildPracticeSetupContext(rolesResponse)

  return {
    setupContext,
    session:
      currentResponse.session === null
        ? {
            status: "setup",
            selection: createDefaultPracticeSelection(setupContext),
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
  return env.mock ? practiceMockService.preparePracticeTrainingEntry(input) : realApiUnavailable()
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
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.requestPracticeReferenceAnswer(input) : realApiUnavailable()
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
): Promise<PracticeMutationResponse> {
  return env.mock
    ? practiceMockService.requestPracticeFollowUpReferenceAnswer(input)
    : realApiUnavailable()
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
): Promise<PracticeMutationResponse> {
  return env.mock ? practiceMockService.skipPracticeQuestion(input) : realApiUnavailable()
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
