import { practiceFixture } from "@/mocks/fixtures/practice"
import type { ActiveSelection, PracticeSession } from "@/models/practice-workflow"

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

      return update({
        ...session,
        status: "review",
        evaluation: practiceFixture.evaluation,
        review: practiceFixture.review,
      })
    },

    async retryQuestion() {
      if (session.status !== "review") return structuredClone(session)

      return update({
        status: "answering",
        selection: session.selection,
        question: session.question,
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
