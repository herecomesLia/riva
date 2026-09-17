import { practiceFixture } from "@/mocks/fixtures/practice"
import type { ActiveSelection, PracticeFollowUp, PracticeSession } from "@/models/practice-workflow"

export function createPracticeFaker() {
  let session: PracticeSession = {
    status: "setup",
    selection: structuredClone(practiceFixture.selection),
  }
  function update(next: PracticeSession = session) {
    session = structuredClone(next)
    return structuredClone(session)
  }

  return {
    async get() {
      return update()
    },

    async start(selection: ActiveSelection) {
      return update({
        status: "generatingQuestion",
        selection,
      })
    },

    async hint() {
      if (session.status !== "answering") return structuredClone(session)

      const help = practiceFixture.questionHelp
      return update({
        ...session,
        question: {
          ...session.question,
          hints: { status: "revealed", content: help.hints },
        },
      })
    },

    async framework() {
      if (session.status !== "answering") return structuredClone(session)

      const help = practiceFixture.questionHelp
      return update({
        ...session,
        question: {
          ...session.question,
          framework: { status: "revealed", content: help.framework },
        },
      })
    },

    async reference() {
      if (session.status !== "answering") return structuredClone(session)

      const help = practiceFixture.questionHelp
      return update({
        ...session,
        question: {
          ...session.question,
          referenceAnswer: {
            status: "revealed",
            content: help.reference,
            viewedBeforeSubmission: true,
          },
        },
      })
    },

    async save(value: boolean) {
      if (session.status !== "answering" && session.status !== "review") {
        return structuredClone(session)
      }
      return update({ ...session, question: { ...session.question, isSaved: value } })
    },

    async weak(value: boolean) {
      if (session.status !== "answering" && session.status !== "review") {
        return structuredClone(session)
      }
      return update({ ...session, question: { ...session.question, isWeak: value } })
    },

    async answer(content: string) {
      if (session.status !== "answering") return structuredClone(session)

      const mainAnswer = { content: content.trim() }
      return update({
        status: "processing",
        selection: session.selection,
        question: session.question,
        mainAnswer,
        followUps: [],
        followUpCompletion: { status: "completed" },
      })
    },

    async followHint() {
      if (session.status !== "answeringFollowUp") return structuredClone(session)

      const help = practiceFixture.followUp
      return update({
        ...session,
        currentFollowUp: {
          ...session.currentFollowUp,
          hints: { status: "revealed", content: help.hints },
        },
      })
    },

    async followFramework() {
      if (session.status !== "answeringFollowUp") return structuredClone(session)

      const help = practiceFixture.followUp
      return update({
        ...session,
        currentFollowUp: {
          ...session.currentFollowUp,
          framework: { status: "revealed", content: help.framework },
        },
      })
    },

    async followReference() {
      if (session.status !== "answeringFollowUp") return structuredClone(session)

      const help = practiceFixture.followUp
      return update({
        ...session,
        currentFollowUp: {
          ...session.currentFollowUp,
          referenceAnswer: {
            status: "revealed",
            content: help.reference,
            viewedBeforeSubmission: true,
          },
        },
      })
    },

    async answerFollowUp(content: string) {
      if (session.status !== "answeringFollowUp") return structuredClone(session)

      return update({
        status: "processing",
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
      })
    },

    async endFollowUps() {
      if (session.status !== "answeringFollowUp") return structuredClone(session)

      return update({
        status: "processing",
        selection: session.selection,
        question: session.question,
        mainAnswer: session.mainAnswer,
        followUps: session.followUps,
        followUpCompletion: {
          status: "endedEarly",
          unanswered: session.currentFollowUp,
        },
      })
    },

    // One poll completes the provisional round task, yielding a question, follow-up, or result.
    async pollTask() {
      if (session.status === "generatingQuestion") {
        return update({
          status: "answering",
          assistedRetry: false,
          selection: session.selection,
          question: practiceFixture.question,
        })
      }
      if (session.status !== "processing") return structuredClone(session)

      if (session.followUps.length === 0 && session.followUpCompletion.status !== "endedEarly") {
        return update({
          status: "answeringFollowUp",
          selection: session.selection,
          question: session.question,
          mainAnswer: session.mainAnswer,
          followUps: session.followUps,
          currentFollowUp: practiceFixture.followUp.question,
        })
      }

      const questionHelp = practiceFixture.questionHelp
      const question = structuredClone(session.question)
      if (question.hints.status === "notRequested") {
        question.hints = { status: "revealed", content: questionHelp.hints }
      }
      if (question.framework.status === "notRequested") {
        question.framework = { status: "revealed", content: questionHelp.framework }
      }
      question.referenceAnswer = {
        status: "revealed",
        content: questionHelp.reference,
        viewedBeforeSubmission:
          question.referenceAnswer.status === "revealed" &&
          question.referenceAnswer.viewedBeforeSubmission,
      }

      const revealFollowUp = (followUp: PracticeFollowUp): PracticeFollowUp => ({
        ...followUp,
        hints:
          followUp.hints.status === "notRequested"
            ? { status: "revealed", content: practiceFixture.followUp.hints }
            : followUp.hints,
        framework:
          followUp.framework.status === "notRequested"
            ? { status: "revealed", content: practiceFixture.followUp.framework }
            : followUp.framework,
        referenceAnswer: {
          status: "revealed",
          content: practiceFixture.followUp.reference,
          viewedBeforeSubmission:
            followUp.referenceAnswer.status === "revealed" &&
            followUp.referenceAnswer.viewedBeforeSubmission,
        },
      })

      return update({
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
        evaluation: practiceFixture.evaluation,
        review: practiceFixture.review,
      })
    },

    async retryQuestion() {
      if (session.status !== "review") return structuredClone(session)

      const question = structuredClone(session.question)
      if (question.referenceAnswer.status === "revealed") {
        question.referenceAnswer.viewedBeforeSubmission = true
      }
      return update({
        status: "answering",
        assistedRetry: true,
        selection: session.selection,
        question,
      })
    },

    async nextQuestion() {
      if (session.status !== "review") return structuredClone(session)

      return update({
        status: "generatingQuestion",
        selection: session.selection,
      })
    },

    async skipQuestion() {
      if (session.status !== "answering") return structuredClone(session)

      return update({
        status: "generatingQuestion",
        selection: session.selection,
      })
    },

    async endSession() {
      if (session.status !== "review") {
        return structuredClone(session)
      }

      return update({
        ...practiceFixture.completion,
        status: "completed",
        selection: session.selection,
      })
    },

    async nextSession() {
      if (session.status !== "completed") return structuredClone(session)

      return update({
        status: "setup",
        selection: session.selection,
      })
    },
  }
}

export const practiceFaker = createPracticeFaker()
