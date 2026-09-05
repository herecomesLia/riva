import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"

import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"

import { PracticeQuestionGuidance } from "./PracticeQuestionGuidance"

function getQuestion(scenario: Parameters<typeof createPracticeScenario>[0]) {
  const response = createPracticeScenario(scenario)
  if (!("question" in response.session)) throw new Error("A question fixture is required.")
  return response.session.question
}

const defaultQuestion = getQuestion("answeringQuestion")
const defaultArgs = {
  framework: defaultQuestion.framework,
  hints: defaultQuestion.hints,
  interactionLocked: false,
  isFrameworkPending: false,
  isHintPending: false,
  onRequestFramework: fn(async () => "executed" as const),
  onRequestHint: fn(async () => "executed" as const),
}

const meta = preview.meta({
  component: PracticeQuestionGuidance,
  title: "Practice/PracticeQuestionGuidance",
})

const requestHint = fn(async () => "executed" as const)

export const RequestHint = meta.story({
  args: { ...defaultArgs, onRequestHint: requestHint },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /请求提示|request hint/i }))
    await expect(requestHint).toHaveBeenCalledTimes(1)
  },
})

export const HintRevealed = meta.story({
  args: {
    ...defaultArgs,
    hints: getQuestion("answeringHintRevealed").hints,
  },
})

export const FrameworkRevealed = meta.story({
  args: {
    ...defaultArgs,
    framework: getQuestion("answeringFrameworkRevealed").framework,
  },
})

const behavioralGuidance = { hints: ["具体情境、个人行动和结果。"] }

export const BehavioralHintRevealed = meta.story({
  args: {
    ...defaultArgs,
    hints: { status: "revealed", content: behavioralGuidance.hints },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/具体情境|specific situation/i)).toBeVisible()
  },
})

const motivationGuidance = { framework: ["岗位吸引力、匹配经历和发展目标。"] }

export const MotivationFrameworkRevealed = meta.story({
  args: {
    ...defaultArgs,
    framework: { status: "revealed", content: motivationGuidance.framework },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/岗位吸引力|role appeal/i)).toBeVisible()
  },
})

const technicalGuidance = { hints: ["说明相关概念。"], framework: ["说明权衡与验证。"] }

export const TechnicalGuidanceRevealed = meta.story({
  args: {
    ...defaultArgs,
    hints: { status: "revealed", content: technicalGuidance.hints },
    framework: { status: "revealed", content: technicalGuidance.framework },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/相关概念|related concepts/i)).toBeVisible()
    await expect(canvas.getByText(/权衡与验证|tradeoffs and validation/i)).toBeVisible()
  },
})

const rejectedHint = fn(async () => {
  throw new Error("unsafe hint error")
})

export const HintError = meta.story({
  args: { ...defaultArgs, onRequestHint: rejectedHint },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /请求提示|request hint/i }))
    await expect(rejectedHint).toHaveBeenCalled()
    await expect(canvas.getByRole("alert")).toBeVisible()
  },
})

const rejectedFramework = fn(async () => {
  throw new Error("unsafe framework error")
})

export const FrameworkError = meta.story({
  args: { ...defaultArgs, onRequestFramework: rejectedFramework },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /请求答题框架|request answer framework/i }),
    )
    await expect(rejectedFramework).toHaveBeenCalled()
    await expect(canvas.getByRole("alert")).toBeVisible()
  },
})
