import preview from "#storybook/preview"
import { expect, fn, waitFor, within } from "storybook/test"

import {
  createGeneratedPracticeQuestion,
  createPracticeFollowUpQuestion,
  createPracticeFollowUpReferenceAnswer,
  createPracticeMockResponse,
  getMockQuestionTemplateId,
  getPracticeFollowUpPlan,
} from "@/mocks/data/practice"
import type { PracticeAnswer, PracticeFollowUpQuestion } from "@/models/practice"

import { PracticeFollowUpAssistance } from "./PracticeFollowUpAssistance"

const response = createPracticeMockResponse("answeringFirstFollowUp")
if (response.session.status !== "answeringFollowUp") throw new Error("Follow-up fixture required.")
const session = response.session
const baseQuestion = session.currentFollowUp.question
const template = getPracticeFollowUpPlan(getMockQuestionTemplateId(session.question))[0]!
const reference = createPracticeFollowUpReferenceAnswer({
  mainQuestion: session.question,
  mainAnswer: session.mainAnswer,
  previousFollowUpExchanges: [],
  currentFollowUp: baseQuestion,
  targetRoleTitle: "Senior Frontend Engineer",
})

const technicalMainQuestion = createGeneratedPracticeQuestion({
  sessionId: "follow_up_story_technical",
  ordinal: 1,
  selection: {
    targetRoleId: "role_frontend_bytedance",
    questionType: "technicalFoundation",
    difficulty: "pressure",
    source: "personalized",
    prioritizeWeaknesses: false,
  },
})
const technicalMainAnswer = {
  id: "follow_up_story_technical_answer",
  content: "我会先用 Profiler 定位更新来源，再验证优化前后的 commit 和交互耗时。",
  createdAt: "2026-07-20T03:00:00.000Z",
  order: 1,
} satisfies PracticeAnswer
const technicalQuestion = createPracticeFollowUpQuestion({
  question: technicalMainQuestion,
  order: 1,
  createdAt: "2026-07-20T03:01:00.000Z",
})
const technicalReference = createPracticeFollowUpReferenceAnswer({
  mainQuestion: technicalMainQuestion,
  mainAnswer: technicalMainAnswer,
  previousFollowUpExchanges: [],
  currentFollowUp: technicalQuestion,
  targetRoleTitle: "Senior Frontend Engineer",
})

function revealedQuestion(
  overrides: Partial<PracticeFollowUpQuestion> = {},
): PracticeFollowUpQuestion {
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
      answerHints: { status: "revealed", content: [...template.answerHints] },
    }),
  },
})

export const FollowUpFrameworkRevealed = meta.story({
  args: {
    ...baseArgs,
    question: revealedQuestion({
      answerFramework: { status: "revealed", content: [...template.answerFramework] },
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
    interactionLocked: false,
    pending: { hint: false, framework: false, referenceAnswer: false },
    question: {
      ...baseArgs.question,
      referenceAnswer: { status: "generating", content: null, viewedBeforeSubmission: false },
    },
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
      throw new Error("internal sessionId=secret stack")
    }),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /查看追问提示|view follow-up hint/i }))
    await expect(canvas.getByRole("alert")).not.toHaveTextContent(/sessionId|stack|secret/)
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
