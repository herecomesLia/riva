import type {
  AnsweredPracticeFollowUpExchange,
  PracticeAttemptRecord,
  PracticeEvaluatingState,
  PracticeFollowUpQuestion,
  PracticePageResponse,
  PracticeReviewState,
} from "@/models/practice"

import { createPracticeMockEvaluationResult } from "./evaluation-builders"
import { createPracticeFollowUpReferenceAnswer } from "./follow-up-catalog"
import { createPracticeReferenceAnswer } from "./reference-answer-catalog"
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

function createPracticeReviewState(session: PracticeEvaluatingState): PracticeReviewState {
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
                templateId: session.question.templateId,
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
  session: Pick<PracticeEvaluatingState, "question" | "mainAnswer" | "selection">,
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
  | "generatingQuestion"
  | "answeringQuestion"
  | "answeringHintRevealed"
  | "answeringFrameworkRevealed"
  | "answeringSavedQuestion"
  | "answeringWeakQuestion"
  | "answeringFirstFollowUp"
  | "answeringSingleFollowUp"
  | "answeringFollowUp"
  | "evaluatingNoFollowUp"
  | "evaluatingFollowUpEndedEarly"
  | "evaluatingAnswer"
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
  | "generatingNextQuestion"
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
      targetRoles: [],
      defaultTargetRoleId: null,
      eligibleQuestionCounts: { saved: 0, history: 0 },
    },
    session: {
      status: "setup",
      selection: { ...defaultSelection, targetRoleId: null },
    },
  },
  noEligibleSavedQuestions: {
    setupContext: {
      ...setupContext,
      eligibleQuestionCounts: { ...setupContext.eligibleQuestionCounts, saved: 0 },
    },
    session: {
      status: "setup",
      selection: { ...defaultSelection, source: "saved" },
    },
  },
  noEligibleHistoryQuestions: {
    setupContext: {
      ...setupContext,
      eligibleQuestionCounts: { ...setupContext.eligibleQuestionCounts, history: 0 },
    },
    session: {
      status: "setup",
      selection: { ...defaultSelection, source: "history" },
    },
  },
  generatingQuestion: {
    setupContext,
    session: {
      status: "generatingQuestion",
      ...activeSession,
      previousAttempt: null,
    },
  },
  generatingNextQuestion: {
    setupContext,
    session: {
      status: "generatingQuestion",
      ...activeSession,
      attemptId: `${activeSession.sessionId}_attempt_2`,
      attemptNumber: 2,
      attemptRecords: [createPracticeAttemptFixture(archivedProjectAttempt)],
      previousAttempt: createPracticeAttemptFixture(archivedProjectAttempt),
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
  evaluatingNoFollowUp: {
    setupContext,
    session: {
      status: "evaluating",
      ...motivationActiveSession,
      question: motivationQuestion,
      mainAnswer: motivationMainAnswer,
      followUpExchanges: [],
      followUpCompletion: {
        status: "completed",
        reason: "noFollowUpRequired",
      },
      submittedAt: "2026-07-20T01:35:00.000Z",
    },
  },
  evaluatingFollowUpEndedEarly: {
    setupContext,
    session: {
      status: "evaluating",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: [firstAnsweredProjectFollowUp],
      followUpCompletion: {
        status: "endedEarly",
        unansweredQuestion: secondProjectFollowUpQuestion,
      },
      submittedAt: "2026-07-20T01:38:00.000Z",
    },
  },
  evaluatingAnswer: {
    setupContext,
    session: {
      status: "evaluating",
      ...activeSession,
      question,
      mainAnswer,
      followUpExchanges: completedProjectFollowUps,
      followUpCompletion: {
        status: "completed",
        reason: "allAnswered",
      },
      submittedAt: "2026-07-20T01:39:00.000Z",
    },
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
      status: "evaluating",
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
      status: "evaluating",
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
        templateId: reviewSession.question.templateId,
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
          templateId: record.question.templateId,
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
