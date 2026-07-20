import type { GetQuestionGenerationStatusInput, PracticePageResponse } from "@/models/practice"

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
