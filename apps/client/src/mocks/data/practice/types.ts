import type {
  PracticeFollowUpReferenceAnswer,
  PracticeFollowUpTemplateId,
  PracticeQuestionTemplateId,
} from "@/models/practice"

export type GeneratedQuestionTemplate = {
  id: PracticeQuestionTemplateId
  prompt: string
  assessedCapabilities: readonly string[]
  recommendedMaterials: readonly string[]
}

export type GeneratedQuestionGuidanceTemplate = {
  hints: readonly string[]
  framework: readonly string[]
}

export type GeneratedPracticeFollowUpTemplate = {
  id: PracticeFollowUpTemplateId
  prompt: string
  answerHints: readonly string[]
  answerFramework: readonly string[]
  referenceAnswer: Omit<PracticeFollowUpReferenceAnswer, "generatedAt">
}
