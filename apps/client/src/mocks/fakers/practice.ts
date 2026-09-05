import {
  practiceEvaluationFixture,
  practiceFollowUps,
  practiceQuestionAlternates,
  practiceQuestionHelp,
  practiceQuestions,
  practiceReviewFixture,
  practiceSetupFixture,
} from "@/mocks/fixtures/practice"
import type {
  ActiveSelection,
  PracticeFollowUp,
  PracticeQuestion,
  PracticeSession,
  ReviewSession,
} from "@/models/practice-workflow"

export function createPracticeFaker(initial: PracticeSession = practiceSetupFixture) {
  let session = structuredClone(initial)
  let sessionSeq = 0
  let progress = {
    questionsCompleted: 0,
    retryCount: 0,
    scoreTotal: 0,
    savedQuestionCount: 0,
    weakQuestionCount: 0,
  }

  function pickQuestion(selection: ActiveSelection, currentQuestionId?: string) {
    const primary = practiceQuestions[selection.questionType]
    const content =
      currentQuestionId === primary.id
        ? practiceQuestionAlternates[selection.questionType]
        : primary
    return {
      ...structuredClone(primary),
      ...structuredClone(content),
      difficulty: selection.difficulty,
    } satisfies PracticeQuestion
  }

  function finalizeReview(review: ReviewSession) {
    progress = {
      questionsCompleted: progress.questionsCompleted + 1,
      retryCount: progress.retryCount,
      scoreTotal: progress.scoreTotal + review.evaluation.overallScore,
      savedQuestionCount: progress.savedQuestionCount + Number(review.question.isSaved),
      weakQuestionCount: progress.weakQuestionCount + Number(review.question.isWeak),
    }
  }

  return {
    async get() {
      return structuredClone(session)
    },

    async start(selection: ActiveSelection) {
      sessionSeq += 1
      session = {
        status: "generatingQuestion",
        sessionId: `practice-session-${sessionSeq}`,
        selection: structuredClone(selection),
        pendingQuestion: pickQuestion(selection),
      }
      return structuredClone(session)
    },

    async pollQuestion() {
      if (session.status !== "generatingQuestion") return structuredClone(session)

      session = {
        status: "answering",
        sessionId: session.sessionId,
        selection: structuredClone(session.selection),
        question: structuredClone(session.pendingQuestion),
      }
      return structuredClone(session)
    },

    async hint() {
      if (session.status !== "answering") return structuredClone(session)

      const help = practiceQuestionHelp[session.question.questionType]
      session = {
        ...session,
        question: {
          ...session.question,
          hints: { status: "revealed", content: structuredClone(help.hints) },
        },
      }
      return structuredClone(session)
    },

    async framework() {
      if (session.status !== "answering") return structuredClone(session)

      const help = practiceQuestionHelp[session.question.questionType]
      session = {
        ...session,
        question: {
          ...session.question,
          framework: { status: "revealed", content: structuredClone(help.framework) },
        },
      }
      return structuredClone(session)
    },

    async reference() {
      if (session.status !== "answering") return structuredClone(session)

      const help = practiceQuestionHelp[session.question.questionType]
      session = {
        ...session,
        question: {
          ...session.question,
          referenceAnswer: {
            status: "revealed",
            content: structuredClone(help.reference),
            viewedBeforeSubmission: true,
          },
        },
      }
      return structuredClone(session)
    },

    async save(value: boolean) {
      if (session.status !== "answering" && session.status !== "review") {
        return structuredClone(session)
      }
      session = { ...session, question: { ...session.question, isSaved: value } }
      return structuredClone(session)
    },

    async weak(value: boolean) {
      if (session.status !== "answering" && session.status !== "review") {
        return structuredClone(session)
      }
      session = { ...session, question: { ...session.question, isWeak: value } }
      return structuredClone(session)
    },

    async answer(content: string) {
      if (session.status !== "answering") return structuredClone(session)

      const mainAnswer = { content: content.trim() }
      const followUp = practiceFollowUps[session.question.questionType]
      if (followUp) {
        session = {
          status: "answeringFollowUp",
          sessionId: session.sessionId,
          selection: session.selection,
          question: session.question,
          mainAnswer,
          followUps: [],
          currentFollowUp: structuredClone(followUp.question),
        }
      } else {
        session = {
          status: "evaluating",
          sessionId: session.sessionId,
          selection: session.selection,
          question: session.question,
          mainAnswer,
          followUps: [],
          followUpCompletion: { status: "completed" },
        }
      }
      return structuredClone(session)
    },

    async followHint() {
      if (session.status !== "answeringFollowUp") return structuredClone(session)

      const help = practiceFollowUps[session.question.questionType]
      if (!help) return structuredClone(session)
      session = {
        ...session,
        currentFollowUp: {
          ...session.currentFollowUp,
          hints: { status: "revealed", content: structuredClone(help.hints) },
        },
      }
      return structuredClone(session)
    },

    async followFramework() {
      if (session.status !== "answeringFollowUp") return structuredClone(session)

      const help = practiceFollowUps[session.question.questionType]
      if (!help) return structuredClone(session)
      session = {
        ...session,
        currentFollowUp: {
          ...session.currentFollowUp,
          framework: { status: "revealed", content: structuredClone(help.framework) },
        },
      }
      return structuredClone(session)
    },

    async followReference() {
      if (session.status !== "answeringFollowUp") return structuredClone(session)

      const help = practiceFollowUps[session.question.questionType]
      if (!help) return structuredClone(session)
      session = {
        ...session,
        currentFollowUp: {
          ...session.currentFollowUp,
          referenceAnswer: {
            status: "revealed",
            content: structuredClone(help.reference),
            viewedBeforeSubmission: true,
          },
        },
      }
      return structuredClone(session)
    },

    async answerFollowUp(content: string) {
      if (session.status !== "answeringFollowUp") return structuredClone(session)

      session = {
        status: "evaluating",
        sessionId: session.sessionId,
        selection: session.selection,
        question: session.question,
        mainAnswer: session.mainAnswer,
        followUps: [
          ...session.followUps,
          {
            question: session.currentFollowUp,
            answer: { content: content.trim() },
          },
        ],
        followUpCompletion: { status: "completed" },
      }
      return structuredClone(session)
    },

    async endFollowUps() {
      if (session.status !== "answeringFollowUp") return structuredClone(session)

      session = {
        status: "evaluating",
        sessionId: session.sessionId,
        selection: session.selection,
        question: session.question,
        mainAnswer: session.mainAnswer,
        followUps: session.followUps,
        followUpCompletion: {
          status: "endedEarly",
          unanswered: structuredClone(session.currentFollowUp),
        },
      }
      return structuredClone(session)
    },

    async pollEvaluation() {
      if (session.status !== "evaluating") return structuredClone(session)

      const questionHelp = practiceQuestionHelp[session.question.questionType]
      const question = structuredClone(session.question)
      question.referenceAnswer = {
        status: "revealed",
        content: structuredClone(questionHelp.reference),
        viewedBeforeSubmission:
          question.referenceAnswer.status === "revealed" &&
          question.referenceAnswer.viewedBeforeSubmission,
      }

      const followUpHelp = practiceFollowUps[session.question.questionType]
      const revealFollowUp = (followUp: PracticeFollowUp): PracticeFollowUp =>
        followUpHelp
          ? {
              ...followUp,
              referenceAnswer: {
                status: "revealed",
                content: structuredClone(followUpHelp.reference),
                viewedBeforeSubmission:
                  followUp.referenceAnswer.status === "revealed" &&
                  followUp.referenceAnswer.viewedBeforeSubmission,
              },
            }
          : followUp

      session = {
        ...session,
        status: "review",
        question,
        followUps: session.followUps.map((followUp) => ({
          ...followUp,
          question: revealFollowUp(followUp.question),
        })),
        followUpCompletion:
          session.followUpCompletion.status === "endedEarly"
            ? {
                status: "endedEarly",
                unanswered: revealFollowUp(session.followUpCompletion.unanswered),
              }
            : session.followUpCompletion,
        attemptNumber: progress.retryCount + 1,
        evaluation: structuredClone(practiceEvaluationFixture),
        review: structuredClone(practiceReviewFixture),
      }
      return structuredClone(session)
    },

    async retryQuestion() {
      if (session.status !== "review") return structuredClone(session)

      progress = { ...progress, retryCount: progress.retryCount + 1 }
      const question = structuredClone(session.question)
      if (question.referenceAnswer.status === "revealed") {
        question.referenceAnswer.viewedBeforeSubmission = true
      }
      session = {
        status: "answering",
        sessionId: session.sessionId,
        selection: session.selection,
        question,
      }
      return structuredClone(session)
    },

    async nextQuestion() {
      if (session.status !== "review") return structuredClone(session)

      finalizeReview(session)
      session = {
        status: "generatingQuestion",
        sessionId: session.sessionId,
        selection: session.selection,
        pendingQuestion: pickQuestion(session.selection, session.question.id),
      }
      return structuredClone(session)
    },

    async skipQuestion() {
      if (session.status !== "answering") return structuredClone(session)

      session = {
        status: "generatingQuestion",
        sessionId: session.sessionId,
        selection: session.selection,
        pendingQuestion: pickQuestion(session.selection, session.question.id),
      }
      return structuredClone(session)
    },

    async endSession() {
      if (session.status !== "review" && session.status !== "answering") {
        return structuredClone(session)
      }

      const completionReason = session.status === "review" ? "reviewCompleted" : "userEndedEarly"
      if (session.status === "review") finalizeReview(session)
      session = {
        status: "completed",
        sessionId: session.sessionId,
        selection: session.selection,
        completionReason,
        questionsCompleted: progress.questionsCompleted,
        retryCount: progress.retryCount,
        savedQuestionCount: progress.savedQuestionCount,
        weakQuestionCount: progress.weakQuestionCount,
        finalAttemptAverageScore:
          progress.questionsCompleted === 0
            ? 0
            : Math.round(progress.scoreTotal / progress.questionsCompleted),
        nextStepSuggestion: "继续练习，并优先补强复盘中暴露的薄弱能力。",
      }
      return structuredClone(session)
    },

    async nextSession() {
      if (session.status !== "completed") return structuredClone(session)

      session = {
        status: "setup",
        selection: structuredClone(session.selection),
      }
      progress = {
        questionsCompleted: 0,
        retryCount: 0,
        scoreTotal: 0,
        savedQuestionCount: 0,
        weakQuestionCount: 0,
      }
      return structuredClone(session)
    },
  }
}

export const practiceFaker = createPracticeFaker()
