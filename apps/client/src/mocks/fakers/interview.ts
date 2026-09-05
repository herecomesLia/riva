import { interviewFixture } from "@/mocks/fixtures/interview"
import type { InterviewConfiguration, InterviewSession } from "@/models/interview-workflow"

export function createInterviewFaker() {
  let session: InterviewSession | null = null

  function snapshot() {
    return structuredClone(session)
  }

  return {
    get() {
      return snapshot()
    },

    start(configuration: InterviewConfiguration) {
      session = {
        status: "opening",
        sessionId: interviewFixture.sessionId,
        configuration: structuredClone(configuration),
        progress: structuredClone(interviewFixture.progress),
        openingMessage: interviewFixture.openingMessage,
      }
      return snapshot()
    },

    begin() {
      if (session?.status !== "opening") return snapshot()

      session = {
        status: "question",
        sessionId: session.sessionId,
        configuration: session.configuration,
        progress: session.progress,
        history: [],
        prompt: structuredClone(interviewFixture.question),
      }
      return snapshot()
    },
  }
}

export const interviewFaker = createInterviewFaker()
