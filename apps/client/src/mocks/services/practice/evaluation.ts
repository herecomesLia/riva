import {
  createPracticeFollowUpReferenceAnswer,
  createPracticeMockEvaluationResult,
  createPracticeReferenceAnswer,
} from "@/mocks/data/practice"
import { waitForMockDelay } from "@/mocks/utils"
import type {
  GetPracticeEvaluationStatusInput,
  PracticeMutationResponse,
  PracticePageResponse,
  RetryPracticeEvaluationInput,
} from "@/models/practice"

import { requireEvaluatingSession } from "./guards"
import {
  copyPracticeState,
  getCurrentTargetRoleTitle,
  getPracticeMockState,
  nextEvaluationPoll,
  resetEvaluationPoll,
  setPracticeMockState,
} from "./state"

function evaluationAttemptKey(sessionId: string, version: number) {
  return `${sessionId}:${version}`
}

export async function getPracticeEvaluationStatus(
  input: GetPracticeEvaluationStatusInput,
): Promise<PracticePageResponse> {
  await waitForMockDelay()
  const session = requireEvaluatingSession(input)
  const attemptKey = evaluationAttemptKey(session.sessionId, session.version)
  const pollCount = nextEvaluationPoll(attemptKey)
  if (pollCount < 2) return copyPracticeState(getPracticeMockState())

  const result = createPracticeMockEvaluationResult(session)
  const followUpExchanges = session.followUpExchanges.map((exchange, index) => ({
    ...copyPracticeState(exchange),
    question: revealFollowUpReference(
      session,
      exchange.question,
      session.followUpExchanges.slice(0, index),
    ),
  }))
  const followUpCompletion =
    session.followUpCompletion.status === "endedEarly"
      ? {
          status: "endedEarly" as const,
          unansweredQuestion: revealFollowUpReference(
            session,
            session.followUpCompletion.unansweredQuestion,
            session.followUpExchanges,
          ),
        }
      : copyPracticeState(session.followUpCompletion)
  const referenceAnswer =
    session.question.referenceAnswer.status === "revealed"
      ? copyPracticeState(session.question.referenceAnswer)
      : {
          status: "revealed" as const,
          content: createPracticeReferenceAnswer({
            templateId: session.question.templateId,
            questionType: session.question.questionType,
            targetRoleTitle: getCurrentTargetRoleTitle(session.selection.targetRoleId),
            questionPrompt: session.question.prompt,
            recommendedMaterials: session.question.recommendedMaterials,
          }),
          viewedBeforeSubmission: false,
        }
  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      status: "review",
      sessionId: session.sessionId,
      version: session.version + 1,
      selection: copyPracticeState(session.selection),
      startedAt: session.startedAt,
      attemptId: session.attemptId,
      attemptNumber: session.attemptNumber,
      attemptRecords: copyPracticeState(session.attemptRecords),
      question: { ...copyPracticeState(session.question), referenceAnswer },
      mainAnswer: copyPracticeState(session.mainAnswer),
      followUpExchanges,
      followUpCompletion,
      evaluation: result.evaluation,
      review: result.review,
    },
  })
}

function revealFollowUpReference(
  session: import("@/models/practice").PracticeEvaluatingState,
  followUp: import("@/models/practice").PracticeFollowUpQuestion,
  previousFollowUpExchanges: readonly import("@/models/practice").AnsweredPracticeFollowUpExchange[],
) {
  if (followUp.referenceAnswer.status === "revealed") return copyPracticeState(followUp)
  return {
    ...copyPracticeState(followUp),
    referenceAnswer: {
      status: "revealed" as const,
      content: createPracticeFollowUpReferenceAnswer({
        mainQuestion: session.question,
        mainAnswer: session.mainAnswer,
        previousFollowUpExchanges,
        currentFollowUp: followUp,
        targetRoleTitle: getCurrentTargetRoleTitle(session.selection.targetRoleId),
      }),
      viewedBeforeSubmission: false,
    },
  }
}

export async function retryPracticeEvaluation(
  input: RetryPracticeEvaluationInput,
): Promise<PracticeMutationResponse> {
  await waitForMockDelay()
  const session = requireEvaluatingSession(input)
  const nextVersion = session.version + 1
  resetEvaluationPoll(evaluationAttemptKey(session.sessionId, nextVersion))

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      ...session,
      version: nextVersion,
    },
  })
}
