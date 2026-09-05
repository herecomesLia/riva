import preview from "#storybook/preview"
import { expect, within } from "storybook/test"

import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"

import { PracticeQuestionCard } from "./PracticeQuestionCard"

function getQuestion(scenario: Parameters<typeof createPracticeScenario>[0]) {
  const response = createPracticeScenario(scenario)
  if (!("question" in response.session)) throw new Error("A question fixture is required.")
  return response.session.question
}

const meta = preview.meta({
  component: PracticeQuestionCard,
  title: "Practice/PracticeQuestionCard",
})

export const DefaultQuestion = meta.story({
  args: { question: getQuestion("answeringQuestion") },
})

export const LongQuestion = meta.story({
  args: {
    question: {
      ...getQuestion("answeringQuestion"),
      prompt:
        "请详细介绍一次你在业务目标、技术债务、交付周期和跨团队协作都存在明显约束的情况下，仍然需要推动关键性能优化落地的经历；请说明你如何识别真正的问题、比较不同方案、处理团队分歧，并最终验证结果。",
    },
  },
})

export const WithRecommendedMaterial = meta.story({
  args: { question: getQuestion("answeringQuestion") },
})

export const SavedQuestion = meta.story({
  args: { question: getQuestion("answeringSavedQuestion") },
})

export const WeakQuestion = meta.story({
  args: { question: getQuestion("answeringWeakQuestion") },
})

export const SavedAndWeakQuestion = meta.story({
  args: {
    question: {
      ...getQuestion("answeringQuestion"),
      isWeak: true,
      isSaved: true,
    },
  },
  play: async ({ canvas }) => {
    const statuses = canvas.getByTestId("practice-question-statuses")
    await expect(statuses).toHaveAttribute("data-slot", "card-action")
    await expect(within(statuses).getByText(/已收藏|saved/i)).toBeInTheDocument()
    await expect(within(statuses).getByText(/薄弱题|weak/i)).toBeInTheDocument()
  },
})
