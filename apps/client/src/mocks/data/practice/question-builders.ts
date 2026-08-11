import type { ActivePracticeSelection, PracticeQuestionType } from "@/models/practice"

import { generatedQuestionGuidanceTemplates, generatedQuestionTemplates } from "./question-catalog"
import type { MockPracticeQuestionCard } from "./types"

const workExperienceMaterialLabels = new Set([
  "线上突发事件处理经历",
  "用户体验与收益取舍经历",
  "React 性能排查经历",
])

function createMockRecommendedMaterials(templateId: string, labels: readonly string[]) {
  return labels.map((label, index) => {
    const type = workExperienceMaterialLabels.has(label) ? "workExperience" : "projectExperience"
    return {
      type,
      id: `mock-material-${templateId}-${index + 1}`,
      label,
      reason:
        type === "workExperience"
          ? "用于补充工作经历中的判断、协作与结果证据。"
          : "用于补充项目背景、个人行动与结果证据。",
    } as const
  })
}

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
}): MockPracticeQuestionCard {
  const templates = generatedQuestionTemplates[selection.questionType]
  const template = templates[(ordinal - 1) % templates.length] ?? templates[0]

  return {
    id: `practice_question_${sessionId}_${ordinal}`,
    templateId: template.id,
    prompt: template.prompt,
    questionType: selection.questionType,
    difficulty: selection.difficulty,
    assessedCapabilities: [...template.assessedCapabilities],
    recommendedMaterials: createMockRecommendedMaterials(
      template.id,
      template.recommendedMaterials,
    ),
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
