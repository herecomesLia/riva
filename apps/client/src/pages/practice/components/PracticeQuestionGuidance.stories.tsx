import preview from "#storybook/preview"
import { expect, fn, userEvent } from "storybook/test"

import {
  createGeneratedPracticeQuestionGuidance,
  createPracticeMockResponse,
} from "@/mocks/data/practice"

import { PracticeQuestionGuidance } from "./PracticeQuestionGuidance"

function getQuestion(scenario: Parameters<typeof createPracticeMockResponse>[0]) {
  const response = createPracticeMockResponse(scenario)
  if (!("question" in response.session)) throw new Error("A question fixture is required.")
  return response.session.question
}

const defaultQuestion = getQuestion("answeringQuestion")
const defaultArgs = {
  answerFramework: defaultQuestion.answerFramework,
  answerHints: defaultQuestion.answerHints,
  interactionLocked: false,
  isFrameworkPending: false,
  isHintPending: false,
  onRequestFramework: fn(async () => "executed" as const),
  onRequestHint: fn(async () => "executed" as const),
}

const meta = preview.meta({
  component: PracticeQuestionGuidance,
  title: "Practice/Components/QuestionGuidance",
})

export const HintRevealed = meta.story({
  args: {
    ...defaultArgs,
    answerHints: getQuestion("answeringHintRevealed").answerHints,
  },
})

export const FrameworkRevealed = meta.story({
  args: {
    ...defaultArgs,
    answerFramework: getQuestion("answeringFrameworkRevealed").answerFramework,
  },
})

const behavioralGuidance = createGeneratedPracticeQuestionGuidance("behavioral")

export const BehavioralHintRevealed = meta.story({
  args: {
    ...defaultArgs,
    answerHints: { status: "revealed", content: behavioralGuidance.hints },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/具体情境|specific situation/i)).toBeVisible()
  },
})

const motivationGuidance = createGeneratedPracticeQuestionGuidance("motivation")

export const MotivationFrameworkRevealed = meta.story({
  args: {
    ...defaultArgs,
    answerFramework: { status: "revealed", content: motivationGuidance.framework },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/岗位吸引力|role appeal/i)).toBeVisible()
  },
})

const technicalGuidance = createGeneratedPracticeQuestionGuidance("technicalFoundation")

export const TechnicalGuidanceRevealed = meta.story({
  args: {
    ...defaultArgs,
    answerHints: { status: "revealed", content: technicalGuidance.hints },
    answerFramework: { status: "revealed", content: technicalGuidance.framework },
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
