import type { PracticeFollowUpReferenceAnswer, PracticeQuestionCard } from "@/models/practice"

import { generatedQuestionTemplates, type MockPracticeQuestionTemplateId } from "./question-catalog"

export type MockPracticeQuestionCard = PracticeQuestionCard & {
  templateId: MockPracticeQuestionTemplateId
}

export function getMockQuestionTemplateId(
  question: PracticeQuestionCard,
): MockPracticeQuestionTemplateId {
  if (
    !("templateId" in question) ||
    typeof question.templateId !== "string" ||
    !isMockPracticeQuestionTemplateId(question.templateId)
  ) {
    throw new Error("Mock question is missing a valid templateId invariant.")
  }
  return question.templateId
}

function isMockPracticeQuestionTemplateId(
  templateId: string,
): templateId is MockPracticeQuestionTemplateId {
  return Object.values(generatedQuestionTemplates).some((templates) =>
    templates.some((template) => template.id === templateId),
  )
}

export type GeneratedQuestionTemplate = {
  id: string
  prompt: string
  assessedCapabilities: readonly string[]
  recommendedMaterials: readonly string[]
}

export type GeneratedQuestionGuidanceTemplate = {
  hints: readonly string[]
  framework: readonly string[]
}

export type GeneratedPracticeFollowUpTemplate = {
  id: string
  prompt: string
  answerHints: readonly string[]
  answerFramework: readonly string[]
  referenceAnswer: Omit<PracticeFollowUpReferenceAnswer, "generatedAt">
}
