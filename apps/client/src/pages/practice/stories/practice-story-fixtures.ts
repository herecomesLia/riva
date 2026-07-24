import { fn, screen, waitFor, within } from "storybook/test"

import {
  createGeneratedPracticeQuestion,
  createPracticeMockResponse,
  createPracticeReferenceAnswer,
} from "@/mocks/data/practice"

export function createPracticeViewArgs(scenario: Parameters<typeof createPracticeMockResponse>[0]) {
  return {
    answeringActions: {
      onEnd: fn(async () => "executed" as const),
      onRequestFramework: fn(async () => "executed" as const),
      onRequestHint: fn(async () => "executed" as const),
      onRequestReferenceAnswer: fn(async () => "executed" as const),
      onSetSaved: fn(async () => "executed" as const),
      onSetWeak: fn(async () => "executed" as const),
      onSkip: fn(async () => "executed" as const),
      onSubmitAnswer: fn(async () => "executed" as const),
    },
    completedActions: {
      onPrepareNextRound: fn(async () => "executed" as const),
    },
    completedPending: false,
    answeringPending: {
      end: false,
      framework: false,
      hint: false,
      referenceAnswer: false,
      interactionLocked: false,
      saved: false,
      skip: false,
      submitAnswer: false,
      weak: false,
    },
    followUpActions: {
      onEndFollowUps: fn(async () => "executed" as const),
      onRequestFramework: fn(async () => "executed" as const),
      onRequestHint: fn(async () => "executed" as const),
      onRequestReferenceAnswer: fn(async () => "executed" as const),
      onSubmitFollowUp: fn(async () => "executed" as const),
    },
    followUpPending: {
      end: false,
      framework: false,
      hint: false,
      interactionLocked: false,
      referenceAnswer: false,
      submit: false,
    },
    reviewActions: {
      onEndSession: fn(async () => "executed" as const),
      onNextQuestion: fn(async () => "executed" as const),
      onRetryCurrent: fn(async () => "executed" as const),
      onSetSaved: fn(async () => "executed" as const),
      onSetWeak: fn(async () => "executed" as const),
    },
    reviewPending: {
      end: false,
      interactionLocked: false,
      next: false,
      retry: false,
      saved: false,
      weak: false,
    },
    content: { data: createPracticeMockResponse(scenario), status: "ready" as const },
    evaluationError: false,
    generationError: false,
    isEvaluationRetrying: false,
    isGenerationRetrying: false,
    isStarting: false,
    onRetryGeneration: fn(),
    onRetryEvaluation: fn(),
    onStart: fn(async () => undefined),
    variant: "default" as const,
  }
}

export async function getVisiblePracticeEndDialog() {
  return waitFor(() => {
    const dialog = [...screen.getAllByRole("alertdialog")].reverse().find((candidate) =>
      within(candidate).queryByRole("heading", {
        name: /结束本轮专项练习|end this targeted-practice/i,
      }),
    )
    if (!dialog) throw new Error("Expected an open confirmation dialog.")
    return dialog
  })
}

export function withReferenceAnswer(
  scenario: "answeringQuestion" | "reviewBalanced",
  questionType: "projectDeepDive" | "technicalFoundation",
  ordinal: 1 | 2,
  viewedBeforeSubmission: boolean,
  origin: "initial" | "retry" | "nextQuestion" = "initial",
) {
  const args = createPracticeViewArgs(scenario)
  const response = structuredClone(args.content.data)
  if (!("question" in response.session)) throw new Error("Question fixture required.")
  response.session.selection.questionType = questionType
  response.session.question = createGeneratedPracticeQuestion({
    sessionId: response.session.sessionId,
    ordinal,
    selection: response.session.selection,
  })
  response.session.question.referenceAnswer = {
    status: "revealed",
    content: createPracticeReferenceAnswer({
      templateId: response.session.question.templateId,
      questionType: response.session.question.questionType,
      targetRoleTitle: "Senior Frontend Engineer",
      questionPrompt: response.session.question.prompt,
      recommendedMaterials: response.session.question.recommendedMaterials,
    }),
    viewedBeforeSubmission,
  }
  if (response.session.status === "answering" && origin !== "initial") {
    const completed = createPracticeMockResponse("completedSession")
    if (completed.session.status !== "completed") throw new Error("Attempt fixture required.")
    const previousAttempt = structuredClone(completed.session.attemptRecords[0])
    if (!previousAttempt) throw new Error("Attempt fixture required.")
    if (origin === "retry") previousAttempt.question = structuredClone(response.session.question)
    response.session.attemptNumber = 2
    response.session.attemptId = `${response.session.sessionId}_attempt_2`
    response.session.attemptRecords = [previousAttempt]
  }
  return { ...args, content: { data: response, status: "ready" as const } }
}
