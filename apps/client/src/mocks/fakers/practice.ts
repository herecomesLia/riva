import {
  practiceFollowUps,
  practiceQuestionHelp,
  practiceQuestions,
  practiceSetupFixture,
} from "@/mocks/fixtures/practice"
import type { ActiveSelection, PracticeQuestion, PracticeSession } from "@/models/practice-workflow"

export function createPracticeFaker(initial: PracticeSession = practiceSetupFixture) {
  let session = structuredClone(initial)
  let sessionSeq = 0

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
      }
      return structuredClone(session)
    },

    async pollQuestion() {
      if (session.status !== "generatingQuestion") return structuredClone(session)

      const question: PracticeQuestion = structuredClone(
        practiceQuestions[session.selection.questionType],
      )
      question.difficulty = session.selection.difficulty
      session = {
        status: "answering",
        sessionId: session.sessionId,
        selection: structuredClone(session.selection),
        question,
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
      if (session.status !== "answering") return structuredClone(session)
      session = { ...session, question: { ...session.question, isSaved: value } }
      return structuredClone(session)
    },

    async weak(value: boolean) {
      if (session.status !== "answering") return structuredClone(session)
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
  }
}

export const practiceFaker = createPracticeFaker()
