import { practiceQuestionFixture, practiceSetupFixture } from "@/mocks/fixtures/practice"
import type { ActiveSelection, PracticeSession } from "@/models/practice-workflow"

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

      session = {
        status: "answering",
        sessionId: session.sessionId,
        selection: structuredClone(session.selection),
        question: {
          ...structuredClone(practiceQuestionFixture),
          questionType: session.selection.questionType,
          difficulty: session.selection.difficulty,
        },
      }
      return structuredClone(session)
    },
  }
}

export const practiceFaker = createPracticeFaker()
