import { afterEach, beforeEach, vi } from "vitest"

import {
  createPracticeMockResponse,
  getMockQuestionTemplateId,
  getPracticeFollowUpPlan,
} from "@/mocks/data/practice"
import { reconcilePracticeSetupSelection, resetPracticeMockState } from "@/mocks/services/practice"
import { copyPracticeState, getPracticeMockState } from "@/mocks/services/practice/state"
import { resetRolesMockState } from "@/mocks/services/roles"
import {
  endPracticeFollowUps,
  getPracticePage,
  getPracticeEvaluationStatus as requestPracticeEvaluationStatus,
  getQuestionGenerationStatus as requestQuestionGenerationStatus,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  requestPracticeReferenceAnswer,
  requestPracticeFollowUpFramework,
  requestPracticeFollowUpHint,
  requestPracticeFollowUpReferenceAnswer,
  retryPracticeEvaluation,
  retryCurrentPracticeQuestion,
  continueToNextPracticeQuestion,
  endPracticeSession,
  prepareNextPracticeSession,
  preparePracticeTrainingEntry,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession as requestStartPracticeSession,
  submitFollowUpAnswer as requestSubmitFollowUpAnswer,
  submitPrimaryAnswer as requestSubmitPrimaryAnswer,
} from "@/services/practice"
import {
  createTargetRole,
  deleteTargetRole,
  getRolesPage,
  setCurrentTargetRole,
  updateTargetRole,
} from "@/services/roles"
import type {
  PracticeAnsweringState,
  PracticePageResponse,
  PracticeQuestionType,
  PracticeReferenceAnswer,
  PracticeReviewState,
  PracticeServiceResponse,
} from "@/models/practice"
import { isCurrentPracticeAttemptRetry } from "@/pages/practice/practice-attempt"

beforeEach(() => {
  vi.useFakeTimers()
  resetRolesMockState("multipleRoles")
  resetPracticeMockState()
})

afterEach(() => {
  vi.useRealTimers()
})

export async function settle<T>(promise: Promise<T>) {
  await vi.runAllTimersAsync()
  return promise
}

export function requireMockPageResponse(response: PracticeServiceResponse): PracticePageResponse {
  if ("session" in response) return response
  throw new Error("The mock practice service must return a page response.")
}

async function getPracticeEvaluationStatus(
  input: Parameters<typeof requestPracticeEvaluationStatus>[0],
) {
  return requireMockPageResponse(await requestPracticeEvaluationStatus(input))
}

async function submitPrimaryAnswer(input: Parameters<typeof requestSubmitPrimaryAnswer>[0]) {
  return requireMockPageResponse(await requestSubmitPrimaryAnswer(input))
}

async function submitFollowUpAnswer(input: Parameters<typeof requestSubmitFollowUpAnswer>[0]) {
  return requireMockPageResponse(await requestSubmitFollowUpAnswer(input))
}

export async function generateQuestion(
  questionType: PracticeQuestionType,
): Promise<PracticeAnsweringState> {
  const setup = await settle(getPracticePage())
  const targetRoleId = setup.setupContext.defaultTargetRoleId
  if (!targetRoleId) throw new Error("The default practice setup must include a current role.")
  const generating = await settle(
    startPracticeSession({ ...setup.session.selection, targetRoleId, questionType }),
  )
  if (generating.session.status !== "generatingQuestion") {
    throw new Error("The practice session must be generating a question.")
  }
  const input = {
    sessionId: generating.session.sessionId,
    version: generating.session.version,
  }
  await settle(getQuestionGenerationStatus(input))
  const response = await settle(getQuestionGenerationStatus(input))
  if (response.session.status !== "answering") {
    throw new Error("Question generation must produce an answering session.")
  }
  return response.session
}

async function startPracticeSession(input: Parameters<typeof requestStartPracticeSession>[0]) {
  const session = await requestStartPracticeSession(input)
  return {
    ...copyPracticeState(getPracticeMockState()),
    session: copyPracticeState(session),
  }
}

async function getQuestionGenerationStatus(
  input: Parameters<typeof requestQuestionGenerationStatus>[0],
) {
  const session = await requestQuestionGenerationStatus(input)
  return {
    ...copyPracticeState(getPracticeMockState()),
    session: copyPracticeState(session),
  }
}

export async function completeQuestionToReview(
  questionType: PracticeQuestionType,
  options: { endFollowUpsEarly?: boolean } = {},
): Promise<PracticeReviewState> {
  const initial = await generateQuestion(questionType)
  let response = await settle(
    submitPrimaryAnswer({
      sessionId: initial.sessionId,
      version: initial.version,
      questionId: initial.question.id,
      content: "我会说明具体背景、个人判断、协作动作和可验证的结果。",
    }),
  )

  while (response.session.status === "answeringFollowUp") {
    const session = response.session
    if (options.endFollowUpsEarly) {
      response = await settle(
        endPracticeFollowUps({
          sessionId: session.sessionId,
          version: session.version,
          questionId: session.question.id,
          followUpQuestionId: session.currentFollowUp.question.id,
        }),
      )
      break
    }
    response = await settle(
      submitFollowUpAnswer({
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.question.id,
        followUpQuestionId: session.currentFollowUp.question.id,
        content: "我补充说明具体证据、方案取舍、验证方式和风险控制。",
      }),
    )
  }

  if (response.session.status !== "evaluating") {
    throw new Error("A completed answer must enter evaluation.")
  }
  const submittedAt = response.session.submittedAt
  const input = {
    sessionId: response.session.sessionId,
    version: response.session.version,
    questionId: response.session.question.id,
  }
  await settle(getPracticeEvaluationStatus(input))
  const completed = await settle(getPracticeEvaluationStatus(input))
  if (completed.session.status !== "review") {
    throw new Error("Evaluation must produce a review.")
  }
  if (Date.parse(completed.session.evaluation.evaluatedAt) < Date.parse(submittedAt)) {
    throw new Error("Evaluation must not be timestamped before answer submission.")
  }
  return completed.session
}

export async function finishCurrentAttempt(
  initial: PracticeAnsweringState,
): Promise<PracticeReviewState> {
  let response = await settle(
    submitPrimaryAnswer({
      sessionId: initial.sessionId,
      version: initial.version,
      questionId: initial.question.id,
      content: "我会说明背景、个人行动、证据、取舍和结果。",
    }),
  )
  while (response.session.status === "answeringFollowUp") {
    const session = response.session
    response = await settle(
      submitFollowUpAnswer({
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.question.id,
        followUpQuestionId: session.currentFollowUp.question.id,
        content: "我补充关键证据、协作取舍和风险控制。",
      }),
    )
  }
  if (response.session.status !== "evaluating") throw new Error("Expected evaluating session.")
  const input = {
    sessionId: response.session.sessionId,
    version: response.session.version,
    questionId: response.session.question.id,
  }
  await settle(getPracticeEvaluationStatus(input))
  const reviewed = await settle(getPracticeEvaluationStatus(input))
  if (reviewed.session.status !== "review") throw new Error("Expected review session.")
  return reviewed.session
}

export async function continueToSecondQuestion(
  questionType: PracticeQuestionType,
): Promise<PracticeAnsweringState> {
  const firstReview = await finishCurrentAttempt(await generateQuestion(questionType))
  const generating = requireMockPageResponse(
    await settle(
      continueToNextPracticeQuestion({
        sessionId: firstReview.sessionId,
        version: firstReview.version,
        questionId: firstReview.question.id,
      }),
    ),
  )
  if (generating.session.status !== "generatingQuestion") throw new Error("Expected generation.")
  const input = { sessionId: generating.session.sessionId, version: generating.session.version }
  await settle(getQuestionGenerationStatus(input))
  const next = await settle(getQuestionGenerationStatus(input))
  if (next.session.status !== "answering") throw new Error("Expected second question.")
  return next.session
}

export async function revealReferenceAnswer(session: PracticeAnsweringState) {
  const response = await settle(
    requestPracticeReferenceAnswer({
      sessionId: session.sessionId,
      version: session.version,
      questionId: session.question.id,
    }),
  )
  if (response.session.status !== "answering") throw new Error("Expected answering session.")
  if (response.session.question.referenceAnswer.status !== "revealed") {
    throw new Error("Expected revealed reference answer.")
  }
  return response.session
}

export function getRevealedReferenceAnswer(
  session: PracticeAnsweringState,
): PracticeReferenceAnswer {
  if (session.question.referenceAnswer.status !== "revealed") {
    throw new Error("Expected revealed reference answer.")
  }
  return session.question.referenceAnswer.content
}

export async function setCurrentQuestionFlags(
  initial: PracticeAnsweringState,
  flags: { isSaved: boolean; isMarkedWeak: boolean },
): Promise<PracticeAnsweringState> {
  let session = initial

  if (session.question.isSaved !== flags.isSaved) {
    const response = await settle(
      setQuestionSaved({
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.question.id,
        isSaved: flags.isSaved,
      }),
    )
    if (response.session.status !== "answering") {
      throw new Error("Saving a current question must preserve the answering session.")
    }
    session = response.session
  }

  if (session.question.isMarkedWeak !== flags.isMarkedWeak) {
    const response = await settle(
      setQuestionWeak({
        sessionId: session.sessionId,
        version: session.version,
        questionId: session.question.id,
        isMarkedWeak: flags.isMarkedWeak,
      }),
    )
    if (response.session.status !== "answering") {
      throw new Error("Marking a current question weak must preserve the answering session.")
    }
    session = response.session
  }

  return session
}

export async function completeRetriedQuestionWithFinalFlags(
  firstFlags: { isSaved: boolean; isMarkedWeak: boolean },
  secondFlags: { isSaved: boolean; isMarkedWeak: boolean },
) {
  const firstAnswering = await setCurrentQuestionFlags(
    await generateQuestion("motivation"),
    firstFlags,
  )
  const firstReview = await finishCurrentAttempt(firstAnswering)
  const retried = await settle(
    retryCurrentPracticeQuestion({
      sessionId: firstReview.sessionId,
      version: firstReview.version,
      questionId: firstReview.question.id,
    }),
  )
  if (retried.session.status !== "answering") {
    throw new Error("Retrying a reviewed question must return an answering session.")
  }
  const secondAnswering = await setCurrentQuestionFlags(retried.session, secondFlags)
  const secondReview = await finishCurrentAttempt(secondAnswering)
  const completed = await settle(
    endPracticeSession({ sessionId: secondReview.sessionId, version: secondReview.version }),
  )
  if (completed.session.status !== "completed") {
    throw new Error("Finishing the retried question must complete the session.")
  }

  return {
    completed: completed.session,
    firstReview,
    retried: retried.session,
    secondAnswering,
    secondReview,
  }
}

export {
  createPracticeMockResponse,
  getMockQuestionTemplateId,
  getPracticeFollowUpPlan,
  reconcilePracticeSetupSelection,
  resetPracticeMockState,
  resetRolesMockState,
  getPracticePage,
  getPracticeEvaluationStatus,
  getQuestionGenerationStatus,
  requestAnswerFramework,
  requestEndPracticeSession,
  requestPracticeHint,
  requestPracticeReferenceAnswer,
  requestPracticeFollowUpFramework,
  requestPracticeFollowUpHint,
  requestPracticeFollowUpReferenceAnswer,
  retryPracticeEvaluation,
  retryCurrentPracticeQuestion,
  continueToNextPracticeQuestion,
  endPracticeSession,
  prepareNextPracticeSession,
  preparePracticeTrainingEntry,
  setQuestionSaved,
  setQuestionWeak,
  skipPracticeQuestion,
  startPracticeSession,
  submitFollowUpAnswer,
  submitPrimaryAnswer,
  endPracticeFollowUps,
  createTargetRole,
  deleteTargetRole,
  getRolesPage,
  setCurrentTargetRole,
  updateTargetRole,
  isCurrentPracticeAttemptRetry,
}
