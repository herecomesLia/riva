import type {
  ActivePracticeSelection,
  EndPracticeFollowUpsInput,
  EndPracticeSessionInput,
  GetFollowUpGenerationStatusInput,
  GetQuestionGenerationStatusInput,
  GetPracticeEvaluationStatusInput,
  AnsweredPracticeFollowUpExchange,
  PracticeFollowUpMutationInput,
  PracticeActiveSessionState,
  PracticePageResponse,
  PracticeAnswer,
  PracticeEvaluatingState,
  PracticeQuestionCard,
  PracticeQuestionMutationInput,
  PracticeQuestionFlagMutationInput,
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
  questionFlagUpdate: PracticeQuestionFlagMutationInput
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
    !samePracticeSubmittedAnswerSnapshot(current.session, responseSession) ||
    !samePracticeFollowUpCompletionSnapshot(
      current.session.followUpCompletion,
      responseSession.followUpCompletion,
    ) ||
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
        currentSession.attemptId === session.attemptId &&
        currentSession.attemptNumber === session.attemptNumber &&
        samePracticeSelection(session.selection, currentSession.selection) &&
        questionMatches(session, request) &&
        isQuestionFlagMutationResponseValid(
          session,
          currentSession,
          request as PracticeQuestionFlagMutationInput,
        )
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
      return (
        session.status === "completed" &&
        session.completionReason === "userEndedEarly" &&
        session.attemptId === currentSession.attemptId &&
        session.attemptNumber === currentSession.attemptNumber &&
        session.unfinishedAttempt !== null &&
        session.unfinishedAttempt.attemptId === currentSession.attemptId &&
        session.unfinishedAttempt.attemptNumber === currentSession.attemptNumber &&
        "questionId" in request &&
        session.unfinishedAttempt.question.id === request.questionId
      )
    case "endReviewSession":
      return (
        session.status === "completed" &&
        session.completionReason === "reviewCompleted" &&
        session.unfinishedAttempt === null &&
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
      if (
        session.status !== "evaluating" ||
        currentSession.status !== "answeringFollowUp" ||
        !questionMatches(session, request) ||
        !("followUpQuestionId" in request) ||
        !samePracticeSubmittedAnswerSnapshot(currentSession, session) ||
        session.followUpCompletion.status !== "endedEarly"
      ) {
        return false
      }
      return (
        session.followUpCompletion.unansweredQuestion.id === request.followUpQuestionId &&
        session.followUpCompletion.unansweredQuestion.order ===
          currentSession.currentFollowUp.question.order
      )
    case "retryEvaluation":
      return session.status === "evaluating" && questionMatches(session, request)
    case "retryCurrentQuestion":
      return session.status === "answering" && questionMatches(session, request)
  }
}

type VersionedPracticeSession = Exclude<PracticePageResponse["session"], { status: "setup" }>

type PracticeSubmittedAnswerSnapshot = {
  attemptId: string
  attemptNumber: number
  question: { id: string }
  mainAnswer: Pick<PracticeAnswer, "id" | "order">
  followUpExchanges: AnsweredPracticeFollowUpExchange[]
}

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

function samePracticeSelection(left: ActivePracticeSelection, right: ActivePracticeSelection) {
  return (
    left.targetRoleId === right.targetRoleId &&
    left.questionType === right.questionType &&
    left.difficulty === right.difficulty &&
    left.source === right.source &&
    left.prioritizeWeaknesses === right.prioritizeWeaknesses
  )
}

function isQuestionFlagMutationResponseValid(
  response: VersionedPracticeSession,
  current: VersionedPracticeSession,
  request: PracticeQuestionFlagMutationInput,
) {
  if (
    !("question" in response) ||
    !("question" in current) ||
    !samePracticeQuestionSnapshotExceptFlags(response.question, current.question)
  ) {
    return false
  }

  if ("isSaved" in request) {
    return (
      response.question.isSaved === request.isSaved &&
      response.question.isMarkedWeak === current.question.isMarkedWeak &&
      (current.status !== "review" || samePracticeReviewSnapshot(current, response))
    )
  }

  return (
    response.question.isMarkedWeak === request.isMarkedWeak &&
    response.question.isSaved === current.question.isSaved &&
    (current.status !== "review" || samePracticeReviewSnapshot(current, response))
  )
}

function samePracticeQuestionSnapshotExceptFlags(
  left: PracticeQuestionCard,
  right: PracticeQuestionCard,
) {
  const { isMarkedWeak: _leftMarkedWeak, isSaved: _leftSaved, ...leftWithoutFlags } = left
  const { isMarkedWeak: _rightMarkedWeak, isSaved: _rightSaved, ...rightWithoutFlags } = right
  return JSON.stringify(leftWithoutFlags) === JSON.stringify(rightWithoutFlags)
}

function samePracticeReviewSnapshot(
  left: Extract<VersionedPracticeSession, { status: "review" }>,
  right: VersionedPracticeSession,
) {
  if (right.status !== "review") return false
  return (
    samePracticeSubmittedAnswerSnapshot(left, right) &&
    samePracticeFollowUpCompletionSnapshot(left.followUpCompletion, right.followUpCompletion) &&
    JSON.stringify(left.mainAnswer) === JSON.stringify(right.mainAnswer) &&
    JSON.stringify(left.followUpExchanges) === JSON.stringify(right.followUpExchanges) &&
    JSON.stringify(left.followUpCompletion) === JSON.stringify(right.followUpCompletion) &&
    JSON.stringify(left.evaluation) === JSON.stringify(right.evaluation) &&
    JSON.stringify(left.review) === JSON.stringify(right.review)
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

function samePracticeSubmittedAnswerSnapshot(
  left: PracticeSubmittedAnswerSnapshot,
  right: PracticeSubmittedAnswerSnapshot,
) {
  return (
    left.attemptId === right.attemptId &&
    left.attemptNumber === right.attemptNumber &&
    left.question.id === right.question.id &&
    left.mainAnswer.id === right.mainAnswer.id &&
    left.mainAnswer.order === right.mainAnswer.order &&
    sameAnsweredFollowUpChain(left.followUpExchanges, right.followUpExchanges)
  )
}

function samePracticeFollowUpCompletionSnapshot(
  left: PracticeEvaluatingState["followUpCompletion"],
  right: PracticeEvaluatingState["followUpCompletion"],
) {
  if (left.status !== right.status) return false
  if (left.status === "endedEarly" && right.status === "endedEarly") {
    return (
      left.unansweredQuestion.id === right.unansweredQuestion.id &&
      left.unansweredQuestion.order === right.unansweredQuestion.order
    )
  }
  if (left.status === "completed" && right.status === "completed") {
    return left.reason === right.reason
  }
  return false
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
