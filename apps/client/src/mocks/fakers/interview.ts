import { interviewFixture } from "@/mocks/fixtures/interview"
import type {
  CompleteInterviewReview,
  InterviewConfiguration,
  InterviewSession,
} from "@/models/interview-workflow"

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

    answer(content: string) {
      if (session?.status !== "question" && session?.status !== "followUp") return snapshot()

      const history = [
        ...session.history,
        {
          kind: session.prompt.kind,
          questionOrder: session.prompt.questionOrder,
          prompt: session.prompt.content,
          answer: content,
        },
      ]

      session =
        session.status === "question"
          ? {
              status: "followUp",
              sessionId: session.sessionId,
              configuration: session.configuration,
              progress: session.progress,
              history,
              prompt: structuredClone(interviewFixture.followUp),
            }
          : {
              status: "candidateQuestions",
              sessionId: session.sessionId,
              configuration: session.configuration,
              progress: { ...session.progress, completedMainQuestions: 1 },
              history,
              prompt: interviewFixture.candidate.prompt,
              exchanges: [],
            }
      return snapshot()
    },

    ask(content: string) {
      if (session?.status !== "candidateQuestions") return snapshot()

      session = {
        ...session,
        exchanges: [
          ...session.exchanges,
          {
            question: content,
            interviewerAnswer: interviewFixture.candidate.interviewerAnswer,
            feedback: structuredClone(interviewFixture.candidate.feedback),
          },
        ],
      }
      return snapshot()
    },

    finish() {
      if (session?.status !== "candidateQuestions") return snapshot()

      session = {
        status: "completed",
        sessionId: session.sessionId,
        history: session.history,
      }
      return snapshot()
    },

    end() {
      if (session === null || session.status === "completed") return snapshot()

      session = {
        status: "completed",
        sessionId: session.sessionId,
        history: "history" in session ? session.history : [],
      }
      return snapshot()
    },

    getReview(): CompleteInterviewReview | null {
      if (session?.status !== "completed") return null

      const review: CompleteInterviewReview = structuredClone(interviewFixture.review)
      review.questionDetails[0]!.answer =
        session.history.find(({ kind }) => kind === "question")?.answer ?? null
      review.questionDetails[0]!.followUps[0]!.answer =
        session.history.find(({ kind }) => kind === "followUp")?.answer ?? null
      return review
    },
  }
}

export const interviewFaker = createInterviewFaker()
