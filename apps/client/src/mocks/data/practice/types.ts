import type { PracticeFollowUpReferenceAnswer } from "@/models/practice"

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
