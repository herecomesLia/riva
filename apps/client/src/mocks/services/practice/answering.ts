import {
  createGeneratedPracticeQuestionGuidance,
  createPracticeFollowUpQuestion,
  createPracticeReferenceAnswer,
  getPracticeFollowUpPlan,
} from "@/mocks/data/practice"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  PracticePageResponse,
  RequestAnswerFrameworkInput,
  RequestPracticeHintInput,
  RequestPracticeReferenceAnswerInput,
  SetPracticeQuestionSavedInput,
  SetPracticeQuestionWeakInput,
  SkipPracticeQuestionInput,
  SubmitPrimaryAnswerInput,
} from "@/models/practice"

import { requireCurrentQuestion, requireCurrentReviewableQuestion } from "./guards"
import {
  copyPracticeState,
  ensureQuestionOrdinal,
  getCurrentTargetRoleTitle,
  getPracticeMockState,
  nextPracticeMutationTimestamp,
  resetGenerationPoll,
  setPracticeMockState,
} from "./state"

export async function requestPracticeHint(
  input: RequestPracticeHintInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)
  if (session.question.answerHints.status !== "notRequested")
    return copyPracticeState(getPracticeMockState())
  const guidance = createGeneratedPracticeQuestionGuidance(session.question.questionType)

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      ...session,
      version: session.version + 1,
      question: {
        ...session.question,
        answerHints: { status: "revealed", content: copyPracticeState(guidance.hints) },
      },
    },
  })
}

export async function requestAnswerFramework(
  input: RequestAnswerFrameworkInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)
  if (session.question.answerFramework.status !== "notRequested")
    return copyPracticeState(getPracticeMockState())
  const guidance = createGeneratedPracticeQuestionGuidance(session.question.questionType)

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      ...session,
      version: session.version + 1,
      question: {
        ...session.question,
        answerFramework: {
          status: "revealed",
          content: copyPracticeState(guidance.framework),
        },
      },
    },
  })
}

export async function requestPracticeReferenceAnswer(
  input: RequestPracticeReferenceAnswerInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)
  if (session.question.referenceAnswer.status !== "notRequested")
    return copyPracticeState(getPracticeMockState())

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      ...session,
      version: session.version + 1,
      question: {
        ...session.question,
        referenceAnswer: {
          status: "revealed",
          content: createPracticeReferenceAnswer({
            templateId: session.question.templateId,
            questionType: session.question.questionType,
            targetRoleTitle: getCurrentTargetRoleTitle(session.selection.targetRoleId),
            questionPrompt: session.question.prompt,
            recommendedMaterials: session.question.recommendedMaterials,
          }),
          viewedBeforeSubmission: true,
        },
      },
    },
  })
}

export async function setQuestionSaved(
  input: SetPracticeQuestionSavedInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentReviewableQuestion(input)
  if (session.question.isSaved === input.isSaved) return copyPracticeState(getPracticeMockState())

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      ...session,
      version: session.version + 1,
      question: { ...session.question, isSaved: input.isSaved },
    },
  })
}

export async function setQuestionWeak(
  input: SetPracticeQuestionWeakInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentReviewableQuestion(input)
  if (session.question.isMarkedWeak === input.isMarkedWeak)
    return copyPracticeState(getPracticeMockState())

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      ...session,
      version: session.version + 1,
      question: { ...session.question, isMarkedWeak: input.isMarkedWeak },
    },
  })
}

export async function submitPrimaryAnswer(
  input: SubmitPrimaryAnswerInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)
  const content = input.content.trim()
  if (!content) throw new Error("Practice answer cannot be empty.")
  const submittedAt = nextPracticeMutationTimestamp()

  const mainAnswer = {
    id: `${session.sessionId}_answer_1`,
    content,
    createdAt: submittedAt,
    order: 1,
  }
  const followUpPlan = getPracticeFollowUpPlan(session.question.templateId)
  const firstTemplate = followUpPlan[0]

  if (!firstTemplate) {
    return setPracticeMockState({
      ...getPracticeMockState(),
      session: {
        ...session,
        status: "evaluating",
        version: session.version + 1,
        mainAnswer,
        followUpExchanges: [],
        followUpCompletion: { status: "completed", reason: "noFollowUpRequired" },
        submittedAt,
      },
    })
  }

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      ...session,
      status: "answeringFollowUp",
      version: session.version + 1,
      mainAnswer,
      followUpExchanges: [],
      currentFollowUp: {
        status: "awaitingAnswer",
        question: createPracticeFollowUpQuestion({
          question: session.question,
          order: 1,
          createdAt: submittedAt,
        }),
        answer: null,
      },
    },
  })
}

export async function skipPracticeQuestion(
  input: SkipPracticeQuestionInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireCurrentQuestion(input)
  ensureQuestionOrdinal(session.sessionId)
  resetGenerationPoll(session.sessionId)

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      status: "generatingQuestion",
      sessionId: session.sessionId,
      version: session.version + 1,
      selection: copyPracticeState(session.selection),
      startedAt: session.startedAt,
      attemptId: session.attemptId,
      attemptNumber: session.attemptNumber,
      attemptRecords: copyPracticeState(session.attemptRecords),
      previousAttempt: null,
    },
  })
}
