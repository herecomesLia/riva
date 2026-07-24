import {
  candidateQuestionsPromptMock,
  createInterviewMockResponse,
  createInterviewReviewResponseMock,
  interviewOpeningMessageMock,
} from "@/mocks/data/interview"
import type {
  GetInterviewReviewResponse,
  InterviewConversationRecordViewData,
} from "@/models/interview"

import type { InterviewSessionSummary } from "./InterviewSessionView"

export function createInterviewSetupStoryFixture(
  scenario: "setupReady" | "prerequisiteNotMet" = "setupReady",
) {
  return structuredClone(createInterviewMockResponse(scenario).setup)
}

export function createInterviewSessionStoryFixture() {
  const response = createInterviewMockResponse("completed")
  const session = response.session
  if (session?.status !== "completed") {
    throw new Error("Completed interview fixture required.")
  }
  const targetRole = response.setup.targetRoles.find(
    ({ id }) => id === session.configuration.targetRoleId,
  )
  if (targetRole === undefined) {
    throw new Error("Completed interview target role fixture required.")
  }
  const candidateExchange = session.candidateQuestionExchanges[0]
  if (candidateExchange === undefined) {
    throw new Error("Candidate question exchange fixture required.")
  }

  const history: InterviewConversationRecordViewData[] = session.completedQuestions.flatMap(
    ({ answer, followUps, question }) => [
      {
        id: question.id,
        kind: "question" as const,
        questionOrder: question.order,
        prompt: question.prompt,
        answer: answer.content,
      },
      ...followUps.map(({ answer: followUpAnswer, question: followUp }) => ({
        id: followUp.id,
        kind: "followUp" as const,
        questionOrder: question.order,
        prompt: followUp.prompt,
        answer: followUpAnswer.content,
      })),
    ],
  )
  const summary: InterviewSessionSummary = {
    targetRole: targetRole.title,
    company: targetRole.company,
    round: session.configuration.round,
    difficulty: session.configuration.difficulty,
    completedQuestions: 1,
    totalQuestions: session.progress.totalQuestions,
  }

  return {
    candidateExchange: structuredClone(candidateExchange),
    candidatePrompt: candidateQuestionsPromptMock,
    completedQuestions: structuredClone(session.completedQuestions),
    history,
    openingMessage: interviewOpeningMessageMock,
    summary,
  }
}

export function createSparseInterviewReviewStoryFixture(): GetInterviewReviewResponse {
  const response = createInterviewReviewResponseMock()
  return {
    ...response,
    questionOverviews: response.questionOverviews.slice(0, 1),
    review: {
      ...response.review,
      dimensionScores: response.review.dimensionScores.slice(0, 2),
      questionReviews: response.review.questionReviews.slice(0, 1),
      mainStrengths: response.review.mainStrengths.slice(0, 1),
      frequentIssues: response.review.frequentIssues.slice(0, 1),
      exposedWeaknesses: response.review.exposedWeaknesses.slice(0, 1),
      riskPoints: response.review.riskPoints.slice(0, 1),
      communicationSuggestions: response.review.communicationSuggestions.slice(0, 1),
      preparationSuggestions: response.review.preparationSuggestions.slice(0, 1),
      nextTraining: {
        ...response.review.nextTraining,
        focusAreas: response.review.nextTraining.focusAreas.slice(0, 1),
      },
    },
  }
}
