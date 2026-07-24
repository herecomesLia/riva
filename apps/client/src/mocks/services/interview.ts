import {
  candidateQuestionsPromptMock,
  createCandidateQuestionExchange,
  createInterviewMockResponse,
  createInterviewQuestionSet,
  createInterviewReview,
  createInterviewReviewResponseMock,
  interviewOpeningMessageMock,
  projectFollowUpQuestionMock,
  type InterviewMockScenario,
} from "@/mocks/data/interview"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  ActiveInterviewSessionResponse,
  BeginInterviewQuestionsInput,
  CompletedInterviewQuestionResponse,
  EndInterviewInput,
  EnterCandidateQuestionsInput,
  FinishInterviewInput,
  GetInterviewReviewInput,
  GetInterviewReviewResponse,
  GetNextInterviewQuestionInput,
  InterviewCandidateQuestionsSessionResponse,
  InterviewCompletedSessionResponse,
  InterviewFollowUpSessionResponse,
  InterviewMutationResponse,
  InterviewPageResponse,
  InterviewQuestionSessionResponse,
  InterviewSessionMutationInput,
  StartInterviewInput,
  SubmitCandidateQuestionInput,
  SubmitInterviewAnswerInput,
} from "@/models/interview"

export type InterviewMockOperation =
  | "beginInterviewQuestions"
  | "endInterview"
  | "enterCandidateQuestions"
  | "finishInterview"
  | "getInterviewPage"
  | "getInterviewReview"
  | "getNextInterviewQuestion"
  | "startInterview"
  | "submitCandidateQuestion"
  | "submitInterviewAnswer"

export type InterviewMockControllerOptions = {
  defaultDelayMs?: number
  delayNext?: Partial<Record<InterviewMockOperation, number>>
  failNext?: readonly InterviewMockOperation[]
}

let response = createInterviewMockResponse()
let sessionSequence = 0
let mutationSequence = 0
let configuredDefaultDelayMs: number | undefined
const delayedOperations = new Map<InterviewMockOperation, number>()
const failingOperations = new Set<InterviewMockOperation>()

function copy<T>(value: T): T {
  return structuredClone(value)
}

function getSnapshot(): InterviewPageResponse {
  return copy(response)
}

function commit(session: InterviewPageResponse["session"]): InterviewMutationResponse {
  response = {
    setup: response.setup,
    session,
  }
  return getSnapshot()
}

function nextTimestamp() {
  mutationSequence += 1
  return new Date(Date.UTC(2026, 6, 24, 2, mutationSequence)).toISOString()
}

function nextId(prefix: string) {
  return `${prefix}-${mutationSequence + 1}`
}

async function consumeOperation(operation: InterviewMockOperation, fallbackDelayMs: number = 600) {
  const delayMs = delayedOperations.get(operation) ?? configuredDefaultDelayMs ?? fallbackDelayMs
  delayedOperations.delete(operation)
  if (delayMs > 0) await waitForMockDelay(delayMs)

  if (failingOperations.delete(operation)) {
    throw new Error(`Interview mock operation failed: ${operation}`)
  }
}

function requireActiveSession(
  input: InterviewSessionMutationInput,
): ActiveInterviewSessionResponse {
  const session = response.session
  if (session === null || session.status === "completed") {
    throw new Error("Interview session is not active.")
  }
  if (session.sessionId !== input.sessionId) {
    throw new Error("Interview session does not match the current session.")
  }
  if (session.version !== input.version) {
    throw new Error("Interview session is out of date.")
  }
  return session
}

function requireContent(content: string) {
  const normalized = content.trim()
  if (!normalized) throw new Error("Interview response content is required.")
  return normalized
}

function toCompletedQuestion(
  session: InterviewQuestionSessionResponse,
): CompletedInterviewQuestionResponse {
  if (session.currentQuestion.status !== "answered") {
    throw new Error("Current interview question has not been answered.")
  }
  return {
    question: session.currentQuestion.question,
    answer: session.currentQuestion.answer,
    followUps: [],
    completedAt: nextTimestamp(),
  }
}

function toCompletedFollowUpQuestion(
  session: InterviewFollowUpSessionResponse,
): CompletedInterviewQuestionResponse {
  if (session.currentFollowUp.status !== "answered") {
    throw new Error("Current interview follow-up has not been answered.")
  }
  return {
    question: session.currentQuestion.question,
    answer: session.currentQuestion.answer,
    followUps: [...session.currentQuestion.answeredFollowUps, session.currentFollowUp],
    completedAt: nextTimestamp(),
  }
}

function createNextQuestionSession(
  session: ActiveInterviewSessionResponse,
  completedQuestions: CompletedInterviewQuestionResponse[],
  currentOrder: number,
): InterviewQuestionSessionResponse {
  const nextQuestion = createInterviewQuestionSet().find(({ order }) => order === currentOrder + 1)
  if (nextQuestion === undefined) {
    throw new Error("No next interview question is available.")
  }

  return {
    status: "question",
    sessionId: session.sessionId,
    version: session.version + 1,
    configuration: session.configuration,
    startedAt: session.startedAt,
    progress: {
      completedQuestions: completedQuestions.length,
      totalQuestions: session.progress.totalQuestions,
    },
    completedQuestions,
    currentQuestion: {
      status: "awaitingAnswer",
      question: nextQuestion,
      answer: null,
    },
  }
}

export function resetInterviewMockState(
  scenario: InterviewMockScenario = "setupReady",
  controller: InterviewMockControllerOptions = {},
) {
  const delayedEntries = Object.entries(controller.delayNext ?? {})
  if (
    (controller.defaultDelayMs !== undefined && controller.defaultDelayMs < 0) ||
    delayedEntries.some(([, delayMs]) => delayMs !== undefined && delayMs < 0)
  ) {
    throw new Error("Interview mock delay must not be negative.")
  }

  response = createInterviewMockResponse(scenario)
  sessionSequence = 0
  mutationSequence = 0
  configuredDefaultDelayMs = controller.defaultDelayMs
  delayedOperations.clear()
  failingOperations.clear()

  for (const operation of controller.failNext ?? []) failingOperations.add(operation)
  for (const [operation, delayMs] of delayedEntries) {
    if (delayMs !== undefined) {
      delayedOperations.set(operation as InterviewMockOperation, delayMs)
    }
  }
}

export async function getInterviewPage(): Promise<InterviewPageResponse> {
  await consumeOperation("getInterviewPage")
  return getSnapshot()
}

export async function startInterview(
  input: StartInterviewInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("startInterview")
  if (response.setup.availability.status === "blocked") {
    throw new Error(`Interview prerequisite is not met: ${response.setup.availability.reason}.`)
  }
  const targetRole = response.setup.targetRoles.find(({ id }) => id === input.targetRoleId)
  if (targetRole === undefined) throw new Error("Interview target role does not exist.")
  if (!targetRole.supportedRounds.includes(input.round)) {
    throw new Error("Interview round is not supported by the target role.")
  }

  sessionSequence += 1
  const questions = createInterviewQuestionSet()
  return commit({
    status: "opening",
    sessionId: `mock-interview-session-${sessionSequence}`,
    version: 1,
    configuration: copy(input),
    startedAt: nextTimestamp(),
    progress: {
      completedQuestions: 0,
      totalQuestions: questions.length,
    },
    completedQuestions: [],
    openingMessage: interviewOpeningMessageMock,
  })
}

export async function beginInterviewQuestions(
  input: BeginInterviewQuestionsInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("beginInterviewQuestions")
  const session = requireActiveSession(input)
  if (session.status !== "opening") {
    throw new Error("Interview opening has already finished.")
  }
  const firstQuestion = createInterviewQuestionSet()[0]
  if (firstQuestion === undefined) throw new Error("Interview question set is empty.")

  return commit({
    status: "question",
    sessionId: session.sessionId,
    version: session.version + 1,
    configuration: session.configuration,
    startedAt: session.startedAt,
    progress: session.progress,
    completedQuestions: session.completedQuestions,
    currentQuestion: {
      status: "awaitingAnswer",
      question: firstQuestion,
      answer: null,
    },
  })
}

export async function submitInterviewAnswer(
  input: SubmitInterviewAnswerInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("submitInterviewAnswer")
  const session = requireActiveSession(input)
  const content = requireContent(input.content)

  if (input.target === "question") {
    if (session.status !== "question") {
      throw new Error("Interview is not awaiting a main answer.")
    }
    if (session.currentQuestion.question.id !== input.questionId) {
      throw new Error("Interview question does not match the current question.")
    }
    if (session.currentQuestion.status === "answered") {
      throw new Error("Current interview question has already been answered.")
    }

    const answer = {
      id: nextId("interview-answer"),
      content,
      submittedAt: nextTimestamp(),
    }
    const answered: InterviewQuestionSessionResponse = {
      ...session,
      version: session.version + 1,
      currentQuestion: {
        status: "answered",
        question: session.currentQuestion.question,
        answer,
      },
    }

    if (answered.currentQuestion.question.id === projectFollowUpQuestionMock.parentQuestionId) {
      return commit({
        status: "followUp",
        sessionId: answered.sessionId,
        version: answered.version,
        configuration: answered.configuration,
        startedAt: answered.startedAt,
        progress: answered.progress,
        completedQuestions: answered.completedQuestions,
        currentQuestion: {
          question: answered.currentQuestion.question,
          answer,
          answeredFollowUps: [],
        },
        currentFollowUp: {
          status: "awaitingAnswer",
          question: copy(projectFollowUpQuestionMock),
          answer: null,
        },
      })
    }

    const completedQuestions = [...answered.completedQuestions, toCompletedQuestion(answered)]
    if (answered.currentQuestion.question.order === answered.progress.totalQuestions) {
      return commit({
        status: "candidateQuestions",
        sessionId: answered.sessionId,
        version: answered.version,
        configuration: answered.configuration,
        startedAt: answered.startedAt,
        progress: {
          completedQuestions: completedQuestions.length,
          totalQuestions: answered.progress.totalQuestions,
        },
        completedQuestions,
        prompt: candidateQuestionsPromptMock,
        exchanges: [],
      })
    }

    return commit(
      createNextQuestionSession(
        { ...answered, version: session.version },
        completedQuestions,
        answered.currentQuestion.question.order,
      ),
    )
  }

  if (session.status !== "followUp") {
    throw new Error("Interview is not awaiting a follow-up answer.")
  }
  if (session.currentQuestion.question.id !== input.questionId) {
    throw new Error("Interview question does not match the current question.")
  }
  if (session.currentFollowUp.question.id !== input.followUpQuestionId) {
    throw new Error("Interview follow-up does not match the current follow-up.")
  }
  if (session.currentFollowUp.status === "answered") {
    throw new Error("Current interview follow-up has already been answered.")
  }

  const answered: InterviewFollowUpSessionResponse = {
    ...session,
    version: session.version + 1,
    currentFollowUp: {
      status: "answered",
      question: session.currentFollowUp.question,
      answer: {
        id: nextId("interview-follow-up-answer"),
        content,
        submittedAt: nextTimestamp(),
      },
    },
  }
  const completedQuestions = [...answered.completedQuestions, toCompletedFollowUpQuestion(answered)]
  return commit(
    createNextQuestionSession(
      { ...answered, version: session.version },
      completedQuestions,
      answered.currentQuestion.question.order,
    ),
  )
}

export async function getNextInterviewQuestion(
  input: GetNextInterviewQuestionInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("getNextInterviewQuestion")
  const session = requireActiveSession(input)

  if (input.target === "question") {
    if (session.status !== "question" || session.currentQuestion.status !== "answered") {
      throw new Error("Interview main answer is not ready to advance.")
    }
    if (session.currentQuestion.question.id !== input.questionId) {
      throw new Error("Interview question does not match the current question.")
    }

    if (session.currentQuestion.question.id === projectFollowUpQuestionMock.parentQuestionId) {
      return commit({
        status: "followUp",
        sessionId: session.sessionId,
        version: session.version + 1,
        configuration: session.configuration,
        startedAt: session.startedAt,
        progress: session.progress,
        completedQuestions: session.completedQuestions,
        currentQuestion: {
          question: session.currentQuestion.question,
          answer: session.currentQuestion.answer,
          answeredFollowUps: [],
        },
        currentFollowUp: {
          status: "awaitingAnswer",
          question: copy(projectFollowUpQuestionMock),
          answer: null,
        },
      })
    }

    if (session.currentQuestion.question.order === session.progress.totalQuestions) {
      const completedQuestions = [...session.completedQuestions, toCompletedQuestion(session)]
      return commit({
        status: "candidateQuestions",
        sessionId: session.sessionId,
        version: session.version + 1,
        configuration: session.configuration,
        startedAt: session.startedAt,
        progress: {
          completedQuestions: completedQuestions.length,
          totalQuestions: session.progress.totalQuestions,
        },
        completedQuestions,
        prompt: candidateQuestionsPromptMock,
        exchanges: [],
      })
    }
    const completedQuestions = [...session.completedQuestions, toCompletedQuestion(session)]
    return commit(
      createNextQuestionSession(
        session,
        completedQuestions,
        session.currentQuestion.question.order,
      ),
    )
  }

  if (
    session.status !== "followUp" ||
    session.currentFollowUp.status !== "answered" ||
    session.currentQuestion.question.id !== input.questionId ||
    session.currentFollowUp.question.id !== input.followUpQuestionId
  ) {
    throw new Error("Interview follow-up answer is not ready to advance.")
  }
  const completedQuestions = [...session.completedQuestions, toCompletedFollowUpQuestion(session)]
  return commit(
    createNextQuestionSession(session, completedQuestions, session.currentQuestion.question.order),
  )
}

export async function enterCandidateQuestions(
  input: EnterCandidateQuestionsInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("enterCandidateQuestions")
  const session = requireActiveSession(input)
  if (
    session.status !== "question" ||
    session.currentQuestion.status !== "answered" ||
    session.currentQuestion.question.id !== input.questionId ||
    session.currentQuestion.question.order !== session.progress.totalQuestions
  ) {
    throw new Error("Interview is not ready for candidate questions.")
  }

  const completedQuestions = [...session.completedQuestions, toCompletedQuestion(session)]
  const next: InterviewCandidateQuestionsSessionResponse = {
    status: "candidateQuestions",
    sessionId: session.sessionId,
    version: session.version + 1,
    configuration: session.configuration,
    startedAt: session.startedAt,
    progress: {
      completedQuestions: completedQuestions.length,
      totalQuestions: session.progress.totalQuestions,
    },
    completedQuestions,
    prompt: candidateQuestionsPromptMock,
    exchanges: [],
  }
  return commit(next)
}

export async function submitCandidateQuestion(
  input: SubmitCandidateQuestionInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("submitCandidateQuestion")
  const session = requireActiveSession(input)
  if (session.status !== "candidateQuestions") {
    throw new Error("Interview is not in the candidate question stage.")
  }
  const content = requireContent(input.content)
  const next: InterviewCandidateQuestionsSessionResponse = {
    ...session,
    version: session.version + 1,
    exchanges: [
      ...session.exchanges,
      createCandidateQuestionExchange(content, session.exchanges.length + 1),
    ],
  }
  return commit(next)
}

export async function finishInterview(
  input: FinishInterviewInput,
): Promise<InterviewMutationResponse> {
  await consumeOperation("finishInterview")
  const session = requireActiveSession(input)
  if (session.status !== "candidateQuestions") {
    throw new Error("Interview can only finish after entering candidate questions.")
  }

  const completed: InterviewCompletedSessionResponse = {
    status: "completed",
    sessionId: session.sessionId,
    version: session.version + 1,
    configuration: session.configuration,
    startedAt: session.startedAt,
    progress: session.progress,
    completedQuestions: session.completedQuestions,
    completedAt: nextTimestamp(),
    candidateQuestionExchanges: session.exchanges,
    review: createInterviewReview(session.completedQuestions.map(({ question }) => question)),
  }
  return commit(completed)
}

export async function endInterview(input: EndInterviewInput): Promise<InterviewMutationResponse> {
  await consumeOperation("endInterview")
  const session = requireActiveSession(input)
  let completedQuestions = session.completedQuestions

  if (session.status === "question" && session.currentQuestion.status === "answered") {
    completedQuestions = [...completedQuestions, toCompletedQuestion(session)]
  } else if (session.status === "followUp" && session.currentFollowUp.status === "answered") {
    completedQuestions = [...completedQuestions, toCompletedFollowUpQuestion(session)]
  }

  const completed: InterviewCompletedSessionResponse = {
    status: "completed",
    sessionId: session.sessionId,
    version: session.version + 1,
    configuration: session.configuration,
    startedAt: session.startedAt,
    progress: {
      completedQuestions: completedQuestions.length,
      totalQuestions: session.progress.totalQuestions,
    },
    completedQuestions,
    completedAt: nextTimestamp(),
    candidateQuestionExchanges: session.status === "candidateQuestions" ? session.exchanges : [],
    review: createInterviewReview(completedQuestions.map(({ question }) => question)),
  }
  return commit(completed)
}

export async function getInterviewReview(
  input: GetInterviewReviewInput,
): Promise<GetInterviewReviewResponse> {
  await consumeOperation("getInterviewReview")
  const session = response.session
  if (session?.status !== "completed" || session.sessionId !== input.sessionId) {
    throw new Error("Interview review is not available.")
  }
  return copy(createInterviewReviewResponseMock(session))
}
