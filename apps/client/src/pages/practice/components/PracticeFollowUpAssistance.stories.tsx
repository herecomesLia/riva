import { practiceFixture } from "@/mocks/fixtures/practice"
import preview from "#storybook/preview"
import { expect, fn, waitFor, within } from "storybook/test"

import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"
import type { PracticeFollowUp } from "@/models/practice-workflow"

import { PracticeFollowUpAssistance } from "./PracticeFollowUpAssistance"

const response = createPracticeScenario("answeringFirstFollowUp")
if (response.session.status !== "answeringFollowUp") throw new Error("Follow-up fixture required.")
const session = response.session
const baseQuestion = session.currentFollowUp
const template = practiceFixture.followUp
const reference = practiceFixture.followUp.reference
const technicalQuestion = structuredClone(baseQuestion)
const technicalReference = { ...reference, kind: "technicalReference" as const }

function revealedQuestion(overrides: Partial<PracticeFollowUp> = {}): PracticeFollowUp {
  return { ...structuredClone(baseQuestion), ...overrides }
}

const baseArgs = {
  question: baseQuestion,
  pending: { hint: false, framework: false, referenceAnswer: false },
  interactionLocked: false,
  onRequestHint: fn(async () => "executed" as const),
  onRequestFramework: fn(async () => "executed" as const),
  onRequestReferenceAnswer: fn(async () => "executed" as const),
}

const meta = preview.meta({
  component: PracticeFollowUpAssistance,
  title: "Practice/PracticeFollowUpAssistance",
})

export const FollowUpAssistanceNotRequested = meta.story({
  args: baseArgs,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /查看追问提示|view follow-up hint/i }),
    ).toBeVisible()
    await expect(
      canvas.getByRole("button", { name: /查看回答思路|view answer approach/i }),
    ).toBeVisible()
    await expect(
      canvas.getByRole("button", { name: /查看 RIVA 参考补充|view RIVA reference supplement/i }),
    ).toBeVisible()
  },
})

export const FollowUpHintRevealed = meta.story({
  args: {
    ...baseArgs,
    question: revealedQuestion({
      hints: { status: "revealed", content: [...template.hints] },
    }),
  },
})

export const FollowUpFrameworkRevealed = meta.story({
  args: {
    ...baseArgs,
    question: revealedQuestion({
      framework: { status: "revealed", content: [...template.framework] },
    }),
  },
})

export const FollowUpReferenceConfirmation = meta.story({
  args: baseArgs,
  play: async ({ canvas, userEvent }) => {
    baseArgs.onRequestReferenceAnswer.mockClear()

    await userEvent.click(
      canvas.getByRole("button", {
        name: /查看 RIVA 参考补充|view RIVA reference supplement/i,
      }),
    )

    await expect(baseArgs.onRequestReferenceAnswer).not.toHaveBeenCalled()

    const dialog = await within(document.body).findByRole("alertdialog")

    await waitFor(() => {
      expect(dialog).toBeVisible()
    })

    const confirmButton = within(dialog).getByRole("button", {
      name: /查看参考补充|view reference supplement/i,
    })

    await waitFor(() => {
      expect(confirmButton).toBeVisible()
      expect(confirmButton).toBeEnabled()
    })

    await userEvent.click(confirmButton)

    await expect(baseArgs.onRequestReferenceAnswer).toHaveBeenCalledTimes(1)
  },
})

export const FollowUpReferenceGenerating = meta.story({
  args: {
    ...baseArgs,
    interactionLocked: true,
    pending: { hint: false, framework: false, referenceAnswer: true },
  },
})

export const FollowUpPersonalizedReference = meta.story({
  args: {
    ...baseArgs,
    question: revealedQuestion({
      referenceAnswer: { status: "revealed", content: reference, viewedBeforeSubmission: false },
    }),
  },
})

export const FollowUpTechnicalReference = meta.story({
  args: {
    ...baseArgs,
    question: {
      ...technicalQuestion,
      referenceAnswer: {
        status: "revealed",
        content: technicalReference,
        viewedBeforeSubmission: false,
      },
    },
  },
})

export const FollowUpReferenceViewedBeforeSubmission = meta.story({
  args: {
    ...baseArgs,
    question: revealedQuestion({
      referenceAnswer: { status: "revealed", content: reference, viewedBeforeSubmission: true },
    }),
  },
})

export const FollowUpReferenceError = meta.story({
  args: {
    ...baseArgs,
    onRequestHint: fn(async () => {
      throw new Error("internal private=secret stack")
    }),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /查看追问提示|view follow-up hint/i }))
    await expect(canvas.getByRole("alert")).not.toHaveTextContent(/private|stack|secret/)
  },
})

export const FollowUpReferenceUnavailable = meta.story({
  args: {
    ...baseArgs,
    question: revealedQuestion({
      referenceAnswer: { status: "unavailable", content: null, viewedBeforeSubmission: false },
    }),
  },
})

export const FollowUpLongContent = meta.story({
  args: {
    ...baseArgs,
    question: revealedQuestion({
      referenceAnswer: {
        status: "revealed",
        content: {
          ...reference,
          answer: `${reference.answer}${" 很长但必须在窄屏内安全换行。".repeat(30)}`,
        },
        viewedBeforeSubmission: true,
      },
    }),
  },
})
