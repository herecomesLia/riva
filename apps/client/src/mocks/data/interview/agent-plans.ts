import type {
  InterviewConfiguration,
  InterviewFollowUpQuestionResponse,
  InterviewProgressResponse,
  InterviewQuestionResponse,
} from "@/models/interview"

import {
  createInterviewFollowUpId,
  createInterviewQuestionId,
  getInterviewQuestionCatalog,
  getInterviewQuestionsForRound,
} from "./question-catalog"

export type InterviewAgentMockScenario =
  | "noFollowUps"
  | "singleFollowUp"
  | "multipleFollowUps"
  | "lastQuestionFollowUp"
  | "unknownTotal"
  | "adjustedPlan"

export type MockInterviewAgentPlan = {
  scenario: InterviewAgentMockScenario
  initialProgress: Pick<InterviewProgressResponse, "totalMainQuestions" | "planRevision">
  planChanges: Array<{
    afterCompletedMainQuestions: number
    totalMainQuestions: number | null
    planRevision: number
  }>
  questions: Array<{
    question: InterviewQuestionResponse
    followUps: InterviewFollowUpQuestionResponse[]
  }>
}

function requestedFollowUps(scenario: InterviewAgentMockScenario, questionIndex: number) {
  if (scenario === "singleFollowUp" && questionIndex === 1) return 1
  if (scenario === "multipleFollowUps" && questionIndex === 1) return 2
  if (scenario === "lastQuestionFollowUp" && questionIndex === 1) return 1
  return 0
}

export function createInterviewAgentPlanMock(
  input: InterviewConfiguration & { scenario: InterviewAgentMockScenario },
): MockInterviewAgentPlan {
  const catalog = getInterviewQuestionCatalog(input.targetRoleId)
  if (catalog === undefined) throw new Error("Interview target role has no question catalog.")
  if (!catalog.supportedRounds.includes(input.round)) {
    throw new Error("Interview round is not supported by the target role.")
  }

  const entries = getInterviewQuestionsForRound(catalog, input.round)
  const questionCount =
    input.scenario === "noFollowUps" || input.scenario === "lastQuestionFollowUp" ? 2 : 3
  const questions = entries.slice(0, questionCount).map((entry, questionIndex) => {
    const id = createInterviewQuestionId(input.targetRoleId, entry.key)
    const followUpCount = Math.min(
      requestedFollowUps(input.scenario, questionIndex),
      input.difficulty === "pressure" ? 2 : 1,
    )
    return {
      question: {
        id,
        prompt: input.difficulty === "pressure" ? entry.pressurePrompt : entry.basicPrompt,
        type: entry.type,
        assessedCapabilities: [...entry.assessedCapabilities],
        order: questionIndex + 1,
      },
      followUps: entry.followUps.slice(0, followUpCount).map((followUpEntry, followUpIndex) => ({
        id: createInterviewFollowUpId(input.targetRoleId, entry.key, followUpEntry.key),
        parentQuestionId: id,
        prompt:
          input.difficulty === "pressure"
            ? followUpEntry.pressurePrompt
            : followUpEntry.basicPrompt,
        order: followUpIndex + 1,
        createdAt: `2026-07-24T02:${String(4 + followUpIndex).padStart(2, "0")}:00.000Z`,
      })),
    }
  })
  const adjustedPlan = input.scenario === "adjustedPlan"

  return structuredClone({
    scenario: input.scenario,
    initialProgress: {
      totalMainQuestions:
        input.scenario === "unknownTotal" ? null : adjustedPlan ? 2 : questionCount,
      planRevision: 1,
    },
    planChanges: adjustedPlan
      ? [{ afterCompletedMainQuestions: 1, totalMainQuestions: 3, planRevision: 2 }]
      : [],
    questions,
  })
}
