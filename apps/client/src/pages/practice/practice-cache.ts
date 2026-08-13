import type {
  EndPracticeFollowUpsInput,
  EndPracticeSessionInput,
  GetFollowUpGenerationStatusInput,
  GetQuestionGenerationStatusInput,
  GetPracticeEvaluationStatusInput,
  AnsweredPracticeFollowUpExchange,
  PracticeFollowUpMutationInput,
  PracticeActiveSessionState,
  PracticePageResponse,
  PracticeQuestionMutationInput,
  PracticeServiceResponse,
  PrepareNextPracticeSessionInput,
  StartPracticeSessionInput,
  SubmitFollowUpAnswerInput,
  SubmitPrimaryAnswerInput,
} from "@/models/practice"

type PracticeMutationInputByKind = {
  continueToNextQuestion: PracticeQuestionMutationInput
  endFollowUps: EndPracticeFollowUpsInput
  endQuestionSession: PracticeQuestionMutationInput
  endReviewSession: EndPracticeSessionInput
  followUpUpdate: PracticeFollowUpMutationInput
  prepareNextSession: PrepareNextPracticeSessionInput
  questionUpdate: PracticeQuestionMutationInput
  questionFlagUpdate: PracticeQuestionMutationInput
  retryCurrentQuestion: PracticeQuestionMutationInput
  retryEvaluation: PracticeQuestionMutationInput
  skipQuestion: PracticeQuestionMutationInput
  startSession: StartPracticeSessionInput
  submitFollowUpAnswer: SubmitFollowUpAnswerInput
  submitPrimaryAnswer: SubmitPrimaryAnswerInput
}

export type PracticeMutationKind = keyof PracticeMutationInputByKind
export type PracticeMutationInputFor<TKind extends PracticeMutationKind> =
  PracticeMutationInputByKind[TKind]

export function synchronizePracticeMutationResponse<TKind extends PracticeMutationKind>(
  current: PracticePageResponse | undefined,
  response: PracticeServiceResponse,
  mutation: {
    kind: TKind
    input: PracticeMutationInputFor<TKind>
  },
): PracticePageResponse | undefined {
  if (mutation.kind === "startSession") {
    if (!isActivePracticeSessionState(response)) return current
    return synchronizeStartResponse(current, response, mutation.input as StartPracticeSessionInput)
  }
  if (mutation.kind === "prepareNextSession") {
    if (!isPracticePageResponse(response)) return current
    return synchronizePrepareNextResponse(
      current,
      response,
      mutation.input as PrepareNextPracticeSessionInput,
    )
  }

  const request = mutation.input as PracticeQuestionMutationInput | EndPracticeSessionInput
  const currentSession = current?.session
  if (
    !currentSession ||
    !isVersionedSession(currentSession) ||
    currentSession.sessionId !== request.sessionId ||
    currentSession.version !== request.version ||
    !currentMatchesMutation(currentSession, mutation.kind, request)
  ) {
    return current
  }

  const responseSession = getPracticeResponseSession(response)
  if (
    !isVersionedSession(responseSession) ||
    responseSession.sessionId !== request.sessionId ||
    responseSession.version !== request.version + 1 ||
    !responseMatchesMutation(responseSession, currentSession, mutation.kind, request)
  ) {
    return current
  }

  return isPracticePageResponse(response) ? response : { ...current, session: responseSession }
}

export function synchronizeQuestionGenerationResponse(
  current: PracticePageResponse | undefined,
  response: PracticeActiveSessionState,
  request: GetQuestionGenerationStatusInput,
) {
  if (
    current?.session.status !== "generatingQuestion" ||
    current.session.sessionId !== request.sessionId ||
    current.session.version !== request.version
  ) {
    return current
  }

  const responseSession = response
  const isPendingSnapshot =
    responseSession.status === "generatingQuestion" && responseSession.version === request.version
  const isCompletedSnapshot =
    responseSession.status === "answering" && responseSession.version === request.version + 1
  if (
    (responseSession.status !== "generatingQuestion" && responseSession.status !== "answering") ||
    responseSession.sessionId !== request.sessionId ||
    (!isPendingSnapshot && !isCompletedSnapshot)
  ) {
    return current
  }

  return { ...current, session: responseSession }
}

export function synchronizeFollowUpGenerationResponse(
  current: PracticePageResponse | undefined,
  response: PracticeActiveSessionState,
  request: GetFollowUpGenerationStatusInput,
) {
  const currentSession = current?.session
  if (
    !currentSession ||
    currentSession.status !== "generatingFollowUp" ||
    currentSession.sessionId !== request.sessionId ||
    currentSession.version !== request.version
  ) {
    return current
  }

  const isPendingSnapshot =
    response.status === "generatingFollowUp" && response.version === request.version
  const isCompletedSnapshot =
    (response.status === "answeringFollowUp" || response.status === "evaluating") &&
    response.version === request.version + 1
  if (
    (!isPendingSnapshot && !isCompletedSnapshot) ||
    response.sessionId !== request.sessionId ||
    response.question.id !== currentSession.question.id ||
    !sameAnsweredFollowUpChain(response.followUpExchanges, currentSession.followUpExchanges)
  ) {
    return current
  }

  return { ...current, session: response }
}

export function synchronizePracticeEvaluationResponse(
  current: PracticePageResponse | undefined,
  response: PracticeServiceResponse,
  request: GetPracticeEvaluationStatusInput,
) {
  if (
    current?.session.status !== "evaluating" ||
    current.session.sessionId !== request.sessionId ||
    current.session.version !== request.version ||
    current.session.question.id !== request.questionId
  ) {
    return current
  }

  const responseSession = getPracticeResponseSession(response)
  const isPendingSnapshot =
    responseSession.status === "evaluating" && responseSession.version === request.version
  const isCompletedSnapshot =
    responseSession.status === "review" && responseSession.version === request.version + 1
  if (
    (responseSession.status !== "evaluating" && responseSession.status !== "review") ||
    responseSession.sessionId !== request.sessionId ||
    responseSession.question.id !== request.questionId ||
    (!isPendingSnapshot && !isCompletedSnapshot)
  ) {
    return current
  }

  return isPracticePageResponse(response) ? response : { ...current, session: responseSession }
}

function synchronizeStartResponse(
  current: PracticePageResponse | undefined,
  response: PracticeActiveSessionState,
  request: StartPracticeSessionInput,
) {
  const responseSession = response
  if (
    current?.session.status !== "setup" ||
    !isSelfConsistentActiveSession(responseSession) ||
    !sameSelection(responseSession.selection, request)
  ) {
    return current
  }
  return { ...current, session: responseSession }
}

function synchronizePrepareNextResponse(
  current: PracticePageResponse | undefined,
  response: PracticePageResponse,
  request: PrepareNextPracticeSessionInput,
) {
  if (
    current?.session.status !== "completed" ||
    current.session.sessionId !== request.sessionId ||
    current.session.version !== request.version ||
    response.session.status !== "setup"
  ) {
    return current
  }
  return response
}

function currentMatchesMutation(
  session: VersionedPracticeSession,
  kind: Exclude<PracticeMutationKind, "startSession" | "prepareNextSession">,
  request: PracticeQuestionMutationInput | EndPracticeSessionInput,
) {
  if (session.status === "completed") return false

  switch (kind) {
    case "questionUpdate":
    case "skipQuestion":
    case "endQuestionSession":
    case "submitPrimaryAnswer":
      return session.status === "answering" && questionMatches(session, request)
    case "questionFlagUpdate":
      return (
        (session.status === "answering" || session.status === "review") &&
        questionMatches(session, request)
      )
    case "followUpUpdate":
    case "submitFollowUpAnswer":
    case "endFollowUps":
      return (
        session.status === "answeringFollowUp" &&
        questionMatches(session, request) &&
        "followUpQuestionId" in request &&
        session.currentFollowUp.question.id === request.followUpQuestionId
      )
    case "retryEvaluation":
      return session.status === "evaluating" && questionMatches(session, request)
    case "retryCurrentQuestion":
    case "continueToNextQuestion":
      return session.status === "review" && questionMatches(session, request)
    case "endReviewSession":
      return session.status === "review"
  }
}

function responseMatchesMutation(
  session: VersionedPracticeSession,
  currentSession: VersionedPracticeSession,
  kind: Exclude<PracticeMutationKind, "startSession" | "prepareNextSession">,
  request: PracticeQuestionMutationInput | EndPracticeSessionInput,
) {
  switch (kind) {
    case "questionUpdate":
      return session.status === "answering" && questionMatches(session, request)
    case "questionFlagUpdate":
      return (
        (session.status === "answering" || session.status === "review") &&
        session.status === currentSession.status &&
        questionMatches(session, request)
      )
    case "submitPrimaryAnswer":
      return (
        (session.status === "generatingFollowUp" ||
          session.status === "answeringFollowUp" ||
          session.status === "evaluating") &&
        questionMatches(session, request)
      )
    case "skipQuestion":
    case "continueToNextQuestion":
      return session.status === "generatingQuestion"
    case "endQuestionSession":
      return session.status === "completed"
    case "endReviewSession":
      return (
        session.status === "completed" &&
        session.attemptId === currentSession.attemptId &&
        session.attemptNumber === currentSession.attemptNumber
      )
    case "followUpUpdate":
      return (
        session.status === "answeringFollowUp" &&
        questionMatches(session, request) &&
        "followUpQuestionId" in request &&
        session.currentFollowUp.question.id === request.followUpQuestionId
      )
    case "submitFollowUpAnswer":
      return (
        (session.status === "generatingFollowUp" ||
          session.status === "answeringFollowUp" ||
          session.status === "evaluating") &&
        questionMatches(session, request)
      )
    case "endFollowUps":
      return session.status === "evaluating" && questionMatches(session, request)
    case "retryEvaluation":
      return session.status === "evaluating" && questionMatches(session, request)
    case "retryCurrentQuestion":
      return session.status === "answering" && questionMatches(session, request)
  }
}

type VersionedPracticeSession = Exclude<PracticePageResponse["session"], { status: "setup" }>

function isVersionedSession(
  session: PracticePageResponse["session"],
): session is VersionedPracticeSession {
  return "sessionId" in session && "version" in session
}

function questionMatches(
  session: VersionedPracticeSession,
  request: PracticeQuestionMutationInput | EndPracticeSessionInput,
) {
  return (
    "question" in session && "questionId" in request && session.question.id === request.questionId
  )
}

function sameSelection(selection: StartPracticeSessionInput, request: StartPracticeSessionInput) {
  return (
    selection.targetRoleId === request.targetRoleId &&
    selection.questionType === request.questionType &&
    selection.difficulty === request.difficulty &&
    selection.source === request.source &&
    selection.prioritizeWeaknesses === request.prioritizeWeaknesses
  )
}

function isActivePracticeSessionState(
  response: PracticeServiceResponse,
): response is PracticeActiveSessionState {
  return "status" in response && response.status !== "completed"
}

function isPracticePageResponse(
  response: PracticeServiceResponse,
): response is PracticePageResponse {
  return "setupContext" in response && "session" in response
}

export function getPracticeResponseSession(
  response: PracticeServiceResponse,
): PracticePageResponse["session"] {
  return isPracticePageResponse(response) ? response.session : response
}

function sameAnsweredFollowUpChain(
  left: AnsweredPracticeFollowUpExchange[],
  right: AnsweredPracticeFollowUpExchange[],
) {
  return (
    left.length === right.length &&
    left.every((exchange, index) => {
      const other = right[index]
      return (
        other !== undefined &&
        exchange.question.id === other.question.id &&
        exchange.question.order === other.question.order &&
        exchange.answer.id === other.answer.id &&
        exchange.answer.order === other.answer.order
      )
    })
  )
}

function isSelfConsistentActiveSession(session: PracticeActiveSessionState): boolean {
  return (
    session.sessionId.length > 0 &&
    session.attemptId.length > 0 &&
    session.version > 0 &&
    session.attemptNumber > 0 &&
    session.selection.targetRoleId.length > 0
  )
}
