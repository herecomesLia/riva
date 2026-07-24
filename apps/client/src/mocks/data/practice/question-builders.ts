import type {
  ActivePracticeSelection,
  PracticeQuestionCard,
  PracticeQuestionType,
} from "@/models/practice"

import { generatedQuestionGuidanceTemplates, generatedQuestionTemplates } from "./question-catalog"

export function createGeneratedPracticeQuestionGuidance(questionType: PracticeQuestionType): {
  hints: string[]
  framework: string[]
} {
  const template = generatedQuestionGuidanceTemplates[questionType]
  return {
    hints: [...template.hints],
    framework: [...template.framework],
  }
}

export function createGeneratedPracticeQuestion({
  sessionId,
  ordinal,
  selection,
}: {
  sessionId: string
  ordinal: number
  selection: ActivePracticeSelection
}): PracticeQuestionCard {
  const templates = generatedQuestionTemplates[selection.questionType]
  const template = templates[(ordinal - 1) % templates.length] ?? templates[0]

  return {
    id: `practice_question_${sessionId}_${ordinal}`,
    templateId: template.id,
    prompt: template.prompt,
    questionType: selection.questionType,
    difficulty: selection.difficulty,
    assessedCapabilities: [...template.assessedCapabilities],
    recommendedMaterials: [...template.recommendedMaterials],
    answerHints: { status: "notRequested", content: null },
    answerFramework: { status: "notRequested", content: null },
    referenceAnswer: {
      status: "notRequested",
      content: null,
      viewedBeforeSubmission: false,
    },
    isSaved: selection.source === "saved",
    isMarkedWeak: false,
  }
}
