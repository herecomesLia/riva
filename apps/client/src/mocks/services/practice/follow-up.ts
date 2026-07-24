import {
  createPracticeFollowUpQuestion,
  createPracticeFollowUpReferenceAnswer,
  getPracticeFollowUpPlan,
} from "@/mocks/data/practice"
import type {
  EndPracticeFollowUpsInput,
  PracticeAnsweringFollowUpState,
  PracticeMutationResponse,
  PracticePageResponse,
  RequestPracticeFollowUpFrameworkInput,
  RequestPracticeFollowUpHintInput,
  RequestPracticeFollowUpReferenceAnswerInput,
  SubmitFollowUpAnswerInput,
} from "@/models/practice"

import { requireCurrentFollowUp } from "./guards"
import {
  consumePracticeMockOperation,
  copyPracticeState,
  getCurrentTargetRoleTitle,
  getPracticeMockState,
  nextPracticeMutationTimestamp,
  setPracticeMockState,
} from "./state"

function commitUnchangedFollowUpMutation(
  session: PracticeAnsweringFollowUpState,
): PracticePageResponse {
  return setPracticeMockState({
    ...getPracticeMockState(),
    session: { ...session, version: session.version + 1 },
  })
}

export async function requestPracticeFollowUpHint(
  input: RequestPracticeFollowUpHintInput,
): Promise<PracticeMutationResponse> {
  const outcome = await consumePracticeMockOperation("requestPracticeFollowUpHint")
  const session = requireCurrentFollowUp(input)
  if (outcome === "unavailable") {
    return setPracticeMockState({
      ...getPracticeMockState(),
      session: {
        ...session,
        version: session.version + 1,
        currentFollowUp: {
          ...session.currentFollowUp,
          question: {
            ...session.currentFollowUp.question,
            answerHints: { status: "unavailable", content: null },
          },
        },
      },
    })
  }
  if (session.currentFollowUp.question.answerHints.status === "revealed") {
    return commitUnchangedFollowUpMutation(session)
  }
  const template = getPracticeFollowUpPlan(session.question.templateId).find(
    ({ id }) => id === session.currentFollowUp.question.templateId,
  )
  if (!template) throw new Error("Practice follow-up template was not found.")

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      ...session,
      version: session.version + 1,
      currentFollowUp: {
        ...session.currentFollowUp,
        question: {
          ...session.currentFollowUp.question,
          answerHints: {
            status: "revealed",
            content: copyPracticeState([...template.answerHints]),
          },
        },
      },
    },
  })
}

export async function requestPracticeFollowUpFramework(
  input: RequestPracticeFollowUpFrameworkInput,
): Promise<PracticeMutationResponse> {
  const outcome = await consumePracticeMockOperation("requestPracticeFollowUpFramework")
  const session = requireCurrentFollowUp(input)
  if (outcome === "unavailable") {
    return setPracticeMockState({
      ...getPracticeMockState(),
      session: {
        ...session,
        version: session.version + 1,
        currentFollowUp: {
          ...session.currentFollowUp,
          question: {
            ...session.currentFollowUp.question,
            answerFramework: { status: "unavailable", content: null },
          },
        },
      },
    })
  }
  if (session.currentFollowUp.question.answerFramework.status === "revealed") {
    return commitUnchangedFollowUpMutation(session)
  }
  const template = getPracticeFollowUpPlan(session.question.templateId).find(
    ({ id }) => id === session.currentFollowUp.question.templateId,
  )
  if (!template) throw new Error("Practice follow-up template was not found.")

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      ...session,
      version: session.version + 1,
      currentFollowUp: {
        ...session.currentFollowUp,
        question: {
          ...session.currentFollowUp.question,
          answerFramework: {
            status: "revealed",
            content: copyPracticeState([...template.answerFramework]),
          },
        },
      },
    },
  })
}

export async function requestPracticeFollowUpReferenceAnswer(
  input: RequestPracticeFollowUpReferenceAnswerInput,
): Promise<PracticeMutationResponse> {
  const outcome = await consumePracticeMockOperation("requestPracticeFollowUpReferenceAnswer")
  const session = requireCurrentFollowUp(input)
  if (outcome === "unavailable") {
    return setPracticeMockState({
      ...getPracticeMockState(),
      session: {
        ...session,
        version: session.version + 1,
        currentFollowUp: {
          ...session.currentFollowUp,
          question: {
            ...session.currentFollowUp.question,
            referenceAnswer: {
              status: "unavailable",
              content: null,
              viewedBeforeSubmission: false,
            },
          },
        },
      },
    })
  }
  if (session.currentFollowUp.question.referenceAnswer.status === "revealed") {
    return commitUnchangedFollowUpMutation(session)
  }

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      ...session,
      version: session.version + 1,
      currentFollowUp: {
        ...session.currentFollowUp,
        question: {
          ...session.currentFollowUp.question,
          referenceAnswer: {
            status: "revealed",
            content: createPracticeFollowUpReferenceAnswer({
              mainQuestion: session.question,
              mainAnswer: session.mainAnswer,
              previousFollowUpExchanges: session.followUpExchanges,
              currentFollowUp: session.currentFollowUp.question,
              targetRoleTitle: getCurrentTargetRoleTitle(session.selection.targetRoleId),
            }),
            viewedBeforeSubmission: true,
          },
        },
      },
    },
  })
}

export async function submitFollowUpAnswer(
  input: SubmitFollowUpAnswerInput,
): Promise<PracticeMutationResponse> {
  await consumePracticeMockOperation("submitFollowUpAnswer")
  const session = requireCurrentFollowUp(input)
  const content = input.content.trim()
  if (!content) throw new Error("Practice follow-up answer cannot be empty.")
  const submittedAt = nextPracticeMutationTimestamp()
  const answeredExchange = {
    status: "answered" as const,
    question: copyPracticeState(session.currentFollowUp.question),
    answer: {
      id: `${session.sessionId}_answer_${session.currentFollowUp.question.order + 1}`,
      content,
      createdAt: submittedAt,
      order: session.currentFollowUp.question.order + 1,
    },
  }
  const followUpExchanges = [...session.followUpExchanges, answeredExchange]
  const plan = getPracticeFollowUpPlan(session.question.templateId)
  const nextOrder = session.currentFollowUp.question.order + 1
  const nextTemplate = plan[nextOrder - 1]

  if (!nextTemplate) {
    return setPracticeMockState({
      ...getPracticeMockState(),
      session: {
        status: "evaluating",
        sessionId: session.sessionId,
        version: session.version + 1,
        selection: copyPracticeState(session.selection),
        startedAt: session.startedAt,
        attemptId: session.attemptId,
        attemptNumber: session.attemptNumber,
        attemptRecords: copyPracticeState(session.attemptRecords),
        question: copyPracticeState(session.question),
        mainAnswer: copyPracticeState(session.mainAnswer),
        followUpExchanges,
        followUpCompletion: { status: "completed", reason: "allAnswered" },
        submittedAt,
      },
    })
  }

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      ...session,
      version: session.version + 1,
      followUpExchanges,
      currentFollowUp: {
        status: "awaitingAnswer",
        question: createPracticeFollowUpQuestion({
          question: session.question,
          order: nextOrder,
          createdAt: submittedAt,
        }),
        answer: null,
      },
    },
  })
}

export async function endPracticeFollowUps(
  input: EndPracticeFollowUpsInput,
): Promise<PracticeMutationResponse> {
  await consumePracticeMockOperation("endPracticeFollowUps")
  const session = requireCurrentFollowUp(input)

  return setPracticeMockState({
    ...getPracticeMockState(),
    session: {
      status: "evaluating",
      sessionId: session.sessionId,
      version: session.version + 1,
      selection: copyPracticeState(session.selection),
      startedAt: session.startedAt,
      attemptId: session.attemptId,
      attemptNumber: session.attemptNumber,
      attemptRecords: copyPracticeState(session.attemptRecords),
      question: copyPracticeState(session.question),
      mainAnswer: copyPracticeState(session.mainAnswer),
      followUpExchanges: copyPracticeState(session.followUpExchanges),
      followUpCompletion: {
        status: "endedEarly",
        unansweredQuestion: copyPracticeState(session.currentFollowUp.question),
      },
      submittedAt: nextPracticeMutationTimestamp(),
    },
  })
}
