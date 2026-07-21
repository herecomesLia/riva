import type {
  EndPracticeSessionInput,
  GetQuestionGenerationStatusInput,
  GetPracticeEvaluationStatusInput,
  PracticePageResponse,
  PracticeQuestionMutationInput,
} from "@/models/practice"

export function synchronizePracticeSessionMutationResponse(
  current: PracticePageResponse | undefined,
  response: PracticePageResponse,
  request: EndPracticeSessionInput,
) {
  if (!current || !("sessionId" in current.session) || !("version" in current.session)) {
    return current
  }
  if (
    current.session.sessionId !== request.sessionId ||
    current.session.version !== request.version
  ) {
    return current
  }
  const responseSession = response.session
  if (
    responseSession.status !== "completed" ||
    responseSession.sessionId !== request.sessionId ||
    responseSession.version < request.version + 1
  ) {
    return current
  }
  return response
}

export function synchronizeQuestionGenerationResponse(
  current: PracticePageResponse | undefined,
  response: PracticePageResponse,
  request: GetQuestionGenerationStatusInput,
) {
  if (current?.session.status !== "generatingQuestion") return current
  if (
    current.session.sessionId !== request.sessionId ||
    current.session.version !== request.version
  ) {
    return current
  }

  const responseSession = response.session
  if (
    !("sessionId" in responseSession) ||
    responseSession.sessionId !== request.sessionId ||
    responseSession.version < request.version
  ) {
    return current
  }

  return response
}

export function synchronizePracticeEvaluationResponse(
  current: PracticePageResponse | undefined,
  response: PracticePageResponse,
  request: GetPracticeEvaluationStatusInput,
) {
  if (current?.session.status !== "evaluating") return current
  if (
    current.session.sessionId !== request.sessionId ||
    current.session.version !== request.version ||
    current.session.question.id !== request.questionId
  ) {
    return current
  }

  const responseSession = response.session
  if (
    (responseSession.status !== "evaluating" && responseSession.status !== "review") ||
    responseSession.sessionId !== request.sessionId ||
    responseSession.question.id !== request.questionId ||
    responseSession.version < request.version
  ) {
    return current
  }

  return response
}

export function synchronizePracticeMutationResponse(
  current: PracticePageResponse | undefined,
  response: PracticePageResponse,
  request: PracticeQuestionMutationInput,
) {
  if (!current || !("sessionId" in current.session) || !("version" in current.session)) {
    return current
  }
  if (
    current.session.sessionId !== request.sessionId ||
    current.session.version !== request.version
  ) {
    return current
  }

  const responseSession = response.session
  if (
    !("sessionId" in responseSession) ||
    !("version" in responseSession) ||
    responseSession.sessionId !== request.sessionId ||
    responseSession.version < request.version
  ) {
    return current
  }

  return response
}
