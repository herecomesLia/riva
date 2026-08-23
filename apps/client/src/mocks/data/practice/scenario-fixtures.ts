import type {
  AnsweredPracticeFollowUpExchange,
  PracticeAttemptRecord,
  PracticeFollowUpQuestion,
  PracticePageResponse,
  PracticeReviewState,
} from "@/models/practice"

import {
  createPracticeMockEvaluationResult,
  type PracticeEvaluationInput,
} from "./evaluation-builders"
import { createPracticeFollowUpReferenceAnswer } from "./follow-up-catalog"
import { createPracticeReferenceAnswer } from "./reference-answer-catalog"
import { getMockQuestionTemplateId } from "./types"
import {
  activeSession,
  behavioralActiveSession,
  behavioralFollowUpQuestion,
  behavioralMainAnswer,
  behavioralQuestion,
  completedProjectFollowUps,
  defaultSelection,
  evaluation,
  firstAnsweredProjectFollowUp,
  firstProjectFollowUpQuestion,
  frameworkRevealedQuestion,
  highScoreEvaluation,
  highScoreReview,
  hintRevealedQuestion,
  longReview,
  lowScoreEvaluation,
  lowScoreReview,
  mainAnswer,
  motivationActiveSession,
  motivationMainAnswer,
  motivationQuestion,
  nextReview,
  noNewWeaknessesReview,
  question,
  retryReview,
  savedQuestion,
  secondProjectFollowUpQuestion,
  setupContext,
  targetRoles,
  weakQuestion,
} from "./scenario-content"

export type PracticeSubmittedMockState = PracticeEvaluationInput &
  Pick<
    PracticeReviewState,
    | "sessionId"
    | "language"
    | "version"
    | "startedAt"
    | "attemptId"
    | "attemptNumber"
    | "attemptRecords"
    | "followUpExchanges"
  >

export function createPracticeReviewState(
  session: PracticeSubmittedMockState,
): PracticeReviewState {
  const result = createPracticeMockEvaluationResult(session)
  const targetRoleTitle =
    targetRoles.find((role) => role.id === session.selection.targetRoleId)?.title ?? "Target role"
  const followUpExchanges = session.followUpExchanges.map((exchange, index) => ({
    ...exchange,
    question: revealFixtureFollowUpReference(
      session,
      exchange.question,
      session.followUpExchanges.slice(0, index),
      targetRoleTitle,
    ),
  }))
  const followUpCompletion =
    session.followUpCompletion.status === "endedEarly"
      ? {
          status: "endedEarly" as const,
          unansweredQuestion: revealFixtureFollowUpReference(
            session,
            session.followUpCompletion.unansweredQuestion,
            session.followUpExchanges,
            targetRoleTitle,
          ),
        }
      : session.followUpCompletion

  return {
    status: "review",
    sessionId: session.sessionId,
    language: session.language,
    version: session.version + 1,
    selection: session.selection,
    startedAt: session.startedAt,
    attemptId: session.attemptId,
    attemptNumber: session.attemptNumber,
    attemptRecords: session.attemptRecords,
    question: {
      ...session.question,
      referenceAnswer:
        session.question.referenceAnswer.status === "revealed"
          ? session.question.referenceAnswer
          : {
              status: "revealed",
              content: createPracticeReferenceAnswer({
                templateId: getMockQuestionTemplateId(session.question),
                questionType: session.question.questionType,
                targetRoleTitle,
                questionPrompt: session.question.prompt,
                recommendedMaterials: session.question.recommendedMaterials,
              }),
              viewedBeforeSubmission: false,
            },
    },
    mainAnswer: session.mainAnswer,
    followUpExchanges,
    followUpCompletion,
    evaluation: result.evaluation,
    review: result.review,
  }
}

function revealFixtureFollowUpReference(
  session: Pick<PracticeSubmittedMockState, "question" | "mainAnswer" | "selection">,
  followUp: PracticeFollowUpQuestion,
  previousFollowUpExchanges: readonly AnsweredPracticeFollowUpExchange[],
  targetRoleTitle: string,
): PracticeFollowUpQuestion {
  if (followUp.referenceAnswer.status === "revealed") return followUp
  return {
    ...followUp,
    referenceAnswer: {
      status: "revealed",
      content: createPracticeFollowUpReferenceAnswer({
        mainQuestion: session.question,
        mainAnswer: session.mainAnswer,
        previousFollowUpExchanges,
        currentFollowUp: followUp,
        targetRoleTitle,
      }),
      viewedBeforeSubmission: false,
    },
  }
}

function createPracticeAttemptFixture(
  base: PracticeAttemptRecord,
  overrides: Partial<PracticeAttemptRecord> = {},
): PracticeAttemptRecord {
  return {
    ...structuredClone(base),
    ...structuredClone(overrides),
  }
}

const archivedProjectAttempt = createPracticeAttemptFixture({
  attemptId: activeSession.attemptId,
  attemptNumber: 1,
  completedAt: evaluation.evaluatedAt,
  selection: defaultSelection,
  question,
  mainAnswer,
  followUpExchanges: completedProjectFollowUps,
  followUpCompletion: { status: "completed", reason: "allAnswered" },
  evaluation,
  review: nextReview,
})

export type PracticeMockScenario =
  | "setupReady"
  | "noRoles"
  | "noEligibleSavedQuestions"
  | "noEligibleHistoryQuestions"
  | "answeringGeneratedQuestion"
  | "answeringQuestion"
  | "answeringHintRevealed"
  | "answeringFrameworkRevealed"
  | "answeringSavedQuestion"
  | "answeringWeakQuestion"
  | "answeringFirstFollowUp"
  | "answeringSingleFollowUp"
  | "answeringFollowUp"
  | "reviewNoFollowUp"
  | "reviewFollowUpEndedEarly"
  | "reviewAnswer"
  | "reviewRetryRecommended"
  | "reviewNextRecommended"
  | "reviewBalanced"
  | "reviewHighScore"
  | "reviewLowScore"
  | "reviewLongContent"
  | "reviewNoNewWeaknesses"
  | "reviewMotivation"
  | "reviewFollowUpEndedEarly"
  | "completedSession"
  | "retryingCurrentQuestion"
  | "answeringNextQuestion"
  | "completedWithRetries"
  | "completedWithWeakQuestions"

const practiceMockScenarios = {
  setupReady: {
    setupContext,
    session: {
      status: "setup",
      selection: defaultSelection,
    },
  },
  noRoles: {
    setupContext: {
      availability: { status: "blocked", reason: "noTargetRoles" },
      targetRoles: [],
      defaultTargetRoleId: null,
      availableDifficulties: ["basic", "pressure"],
      canPrioritizeWeaknesses: true,
      personalizedQuestionGenerationTargetRoleIds: [],
      eligibleQuestionCounts: { saved: 0, history: 0 },
      questionSourceAvailability: [],
    },
    session: {
      status: "setup",
      selection: { ...defaultSelection, targetRoleId: null },
    },
  },
  noEligibleSavedQuestions: {
    setupContext: {
      ...setupContext,
      questionSourceAvailability: setupContext.questionSourceAvailability.map((availability) => ({
        ...availability,
        savedQuestionCount:
          availability.targetRoleId === defaultSelection.targetRoleId &&
          availability.questionType === defaultSelection.questionType &&
          availability.difficulty === defaultSelection.difficulty
            ? 0
            : availability.savedQuestionCount,
      })),
    },
    session: {
      status: "setup",
      selection: { ...defaultSelection, source: "saved" },
    },
  },
  noEligibleHistoryQuestions: {
    setupContext: {
      ...setupContext,
      questionSourceAvailability: setupContext.questionSourceAvailability.map((availability) => ({
        ...availability,
        historyQuestionCount:
          availability.targetRoleId === defaultSelection.targetRoleId &&
          availability.questionType === defaultSelection.questionType &&
          availability.difficulty === defaultSelection.difficulty
            ? 0
            : availability.historyQuestionCount,
      })),
    },
    session: {
      status: "setup",
      selection: { ...defaultSelection, source: "history" },
    },
  },
  answeringGeneratedQuestion: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      question,
    },
  },
  answeringNextQuestion: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      attemptId: `${activeSession.sessionId}_attempt_2`,
      attemptNumber: 2,
      attemptRecords: [createPracticeAttemptFixture(archivedProjectAttempt)],
      question,
    },
  },
  retryingCurrentQuestion: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      attemptId: `${activeSession.sessionId}_attempt_2`,
      attemptNumber: 2,
      attemptRecords: [archivedProjectAttempt],
      question,
    },
  },
  answeringQuestion: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      question,
    },
  },
  answeringHintRevealed: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      question: hintRevealedQuestion,
    },
  },
  answeringFrameworkRevealed: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      question: frameworkRevealedQuestion,
    },
  },
  answeringSavedQuestion: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      question: savedQuestion,
    },
  },
  answeringWeakQuestion: {
    setupContext,
    session: {
      status: "answering",
      ...activeSession,
      question: weakQuestion,
    },
  },
  answeringFirstFollowUp: {
    setupContext,
    session: {
      status: "answeringFollowUp",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: [],
      currentFollowUp: {
        status: "awaitingAnswer",
        question: firstProjectFollowUpQuestion,
        answer: null,
      },
    },
  },
  answeringSingleFollowUp: {
    setupContext,
    session: {
      status: "answeringFollowUp",
      ...behavioralActiveSession,
      question: behavioralQuestion,
      mainAnswer: behavioralMainAnswer,
      followUpExchanges: [],
      currentFollowUp: {
        status: "awaitingAnswer",
        question: behavioralFollowUpQuestion,
        answer: null,
      },
    },
  },
  answeringFollowUp: {
    setupContext,
    session: {
      status: "answeringFollowUp",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: [firstAnsweredProjectFollowUp],
      currentFollowUp: {
        status: "awaitingAnswer",
        question: secondProjectFollowUpQuestion,
        answer: null,
      },
    },
  },
  reviewNoFollowUp: {
    setupContext,
    session: createPracticeReviewState({
      ...motivationActiveSession,
      question: motivationQuestion,
      mainAnswer: motivationMainAnswer,
      followUpExchanges: [],
      followUpCompletion: {
        status: "completed",
        reason: "noFollowUpRequired",
      },
      submittedAt: "2026-07-20T01:35:00.000Z",
    }),
  },
  reviewFollowUpEndedEarly: {
    setupContext,
    session: createPracticeReviewState({
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: [firstAnsweredProjectFollowUp],
      followUpCompletion: {
        status: "endedEarly",
        unansweredQuestion: secondProjectFollowUpQuestion,
      },
      submittedAt: "2026-07-20T01:38:00.000Z",
    }),
  },
  reviewAnswer: {
    setupContext,
    session: createPracticeReviewState({
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: {
        status: "completed",
        reason: "allAnswered",
      },
      submittedAt: "2026-07-20T01:39:00.000Z",
    }),
  },
  reviewRetryRecommended: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: {
        status: "completed",
        reason: "allAnswered",
      },
      evaluation,
      review: retryReview,
    },
  },
  reviewNextRecommended: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: {
        status: "completed",
        reason: "allAnswered",
      },
      evaluation,
      review: nextReview,
    },
  },
  reviewBalanced: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: { status: "completed", reason: "allAnswered" },
      evaluation,
      review: nextReview,
    },
  },
  reviewHighScore: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: { status: "completed", reason: "allAnswered" },
      evaluation: highScoreEvaluation,
      review: highScoreReview,
    },
  },
  reviewLowScore: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: { status: "completed", reason: "allAnswered" },
      evaluation: lowScoreEvaluation,
      review: lowScoreReview,
    },
  },
  reviewLongContent: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: { status: "completed", reason: "allAnswered" },
      evaluation,
      review: longReview,
    },
  },
  reviewNoNewWeaknesses: {
    setupContext,
    session: {
      status: "review",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: { status: "completed", reason: "allAnswered" },
      evaluation,
      review: noNewWeaknessesReview,
    },
  },
  reviewMotivation: {
    setupContext,
    session: createPracticeReviewState({
      ...motivationActiveSession,
      question: motivationQuestion,
      mainAnswer: motivationMainAnswer,
      followUpExchanges: [],
      followUpCompletion: { status: "completed", reason: "noFollowUpRequired" },
      submittedAt: "2026-07-20T01:35:00.000Z",
    }),
  },
  reviewFollowUpEndedEarly: {
    setupContext,
    session: createPracticeReviewState({
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: [firstAnsweredProjectFollowUp],
      followUpCompletion: {
        status: "endedEarly",
        unansweredQuestion: secondProjectFollowUpQuestion,
      },
      submittedAt: "2026-07-20T01:38:00.000Z",
    }),
  },
  completedSession: {
    setupContext,
    session: {
      status: "completed",
      ...activeSession,
      completionReason: "reviewCompleted",
      unfinishedAttempt: null,
      attemptRecords: [archivedProjectAttempt],
      completedAt: "2026-07-20T01:40:00.000Z",
      questionsCompleted: 1,
      retryCount: 0,
      savedQuestionCount: 0,
      markedWeakQuestionCount: 0,
      finalAttemptAverageScore: evaluation.overallScore,
      nextStepSuggestion: "继续围绕项目深挖补充量化证据，再进入下一轮练习。",
    },
  },
  completedWithRetries: {
    setupContext,
    session: {
      status: "completed",
      ...activeSession,
      completionReason: "reviewCompleted",
      unfinishedAttempt: null,
      attemptId: `${activeSession.sessionId}_attempt_2`,
      attemptNumber: 2,
      attemptRecords: [
        createPracticeAttemptFixture(archivedProjectAttempt),
        createPracticeAttemptFixture(archivedProjectAttempt, {
          attemptId: `${activeSession.sessionId}_attempt_2`,
          attemptNumber: 2,
          evaluation: highScoreEvaluation,
          review: highScoreReview,
        }),
      ],
      completedAt: "2026-07-20T01:41:00.000Z",
      questionsCompleted: 1,
      retryCount: 1,
      savedQuestionCount: 0,
      markedWeakQuestionCount: 0,
      finalAttemptAverageScore: highScoreEvaluation.overallScore,
      nextStepSuggestion: "继续围绕项目深挖补充量化证据，再进入下一轮练习。",
    },
  },
  completedWithWeakQuestions: {
    setupContext,
    session: {
      status: "completed",
      ...activeSession,
      completionReason: "reviewCompleted",
      unfinishedAttempt: null,
      attemptRecords: [
        createPracticeAttemptFixture(archivedProjectAttempt, {
          question: { ...archivedProjectAttempt.question, isMarkedWeak: true },
        }),
      ],
      completedAt: "2026-07-20T01:41:00.000Z",
      questionsCompleted: 1,
      retryCount: 0,
      savedQuestionCount: 0,
      markedWeakQuestionCount: 1,
      finalAttemptAverageScore: evaluation.overallScore,
      nextStepSuggestion: "优先复习本轮标记的薄弱题。",
    },
  },
} satisfies Record<PracticeMockScenario, PracticePageResponse>

export const practiceResponseMock = practiceMockScenarios.setupReady

export function createPracticeMockResponse(
  scenario: PracticeMockScenario = "setupReady",
): PracticePageResponse {
  const response: PracticePageResponse = structuredClone(practiceMockScenarios[scenario])
  if (response.session.status === "review") {
    const reviewSession = response.session
    const roleTitle = response.setupContext.targetRoles.find(
      (role) => role.id === reviewSession.selection.targetRoleId,
    )?.title
    reviewSession.question.referenceAnswer = {
      status: "revealed",
      content: createPracticeReferenceAnswer({
        templateId: getMockQuestionTemplateId(reviewSession.question),
        questionType: reviewSession.question.questionType,
        targetRoleTitle: roleTitle ?? "Target role",
        questionPrompt: reviewSession.question.prompt,
        recommendedMaterials: reviewSession.question.recommendedMaterials,
      }),
      viewedBeforeSubmission: false,
    }
    reviewSession.followUpExchanges = reviewSession.followUpExchanges.map(
      (exchange, index, exchanges) => ({
        ...exchange,
        question: revealFixtureFollowUpReference(
          reviewSession,
          exchange.question,
          exchanges.slice(0, index),
          roleTitle ?? "Target role",
        ),
      }),
    )
    if (reviewSession.followUpCompletion.status === "endedEarly") {
      reviewSession.followUpCompletion.unansweredQuestion = revealFixtureFollowUpReference(
        reviewSession,
        reviewSession.followUpCompletion.unansweredQuestion,
        reviewSession.followUpExchanges,
        roleTitle ?? "Target role",
      )
    }
  }
  if (response.session.status === "completed") {
    for (const record of response.session.attemptRecords) {
      record.question.referenceAnswer = {
        status: "revealed",
        content: createPracticeReferenceAnswer({
          templateId: getMockQuestionTemplateId(record.question),
          questionType: record.question.questionType,
          targetRoleTitle:
            response.setupContext.targetRoles.find(
              (role) => role.id === record.selection.targetRoleId,
            )?.title ?? "Target role",
          questionPrompt: record.question.prompt,
          recommendedMaterials: record.question.recommendedMaterials,
        }),
        viewedBeforeSubmission: false,
      }
      const roleTitle =
        response.setupContext.targetRoles.find((role) => role.id === record.selection.targetRoleId)
          ?.title ?? "Target role"
      record.followUpExchanges = record.followUpExchanges.map((exchange, index, exchanges) => ({
        ...exchange,
        question: revealFixtureFollowUpReference(
          record,
          exchange.question,
          exchanges.slice(0, index),
          roleTitle,
        ),
      }))
      if (record.followUpCompletion.status === "endedEarly") {
        record.followUpCompletion.unansweredQuestion = revealFixtureFollowUpReference(
          record,
          record.followUpCompletion.unansweredQuestion,
          record.followUpExchanges,
          roleTitle,
        )
      }
    }
  }
  return response
}
