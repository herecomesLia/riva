import type {
  GetQuestionGenerationStatusInput,
  PracticePageResponse,
  PracticeQuestionMutationInput,
} from "@/models/practice"

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
