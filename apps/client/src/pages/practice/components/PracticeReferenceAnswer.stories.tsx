import preview from "#storybook/preview"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import { useState } from "react"

import {
  createGeneratedPracticeQuestion,
  createPracticeReferenceAnswer,
  getMockQuestionTemplateId,
} from "@/mocks/data/practice"
import type { ActivePracticeSelection, PracticeReferenceAnswerState } from "@/models/practice"

import { PracticeReferenceAnswer } from "./PracticeReferenceAnswer"

const selection = {
  targetRoleId: "role_frontend_bytedance",
  questionType: "projectDeepDive",
  difficulty: "basic",
  source: "personalized",
  prioritizeWeaknesses: false,
} satisfies ActivePracticeSelection
const projectQuestion = createGeneratedPracticeQuestion({
  sessionId: "reference_story",
  ordinal: 1,
  selection,
})
const technicalQuestion = createGeneratedPracticeQuestion({
  sessionId: "reference_story_technical",
  ordinal: 1,
  selection: { ...selection, questionType: "technicalFoundation" },
})
function answerFor(question: typeof projectQuestion) {
  return createPracticeReferenceAnswer({
    templateId: getMockQuestionTemplateId(question),
    questionType: question.questionType,
    targetRoleTitle: "Senior Frontend Engineer",
    questionPrompt: question.prompt,
    recommendedMaterials: question.recommendedMaterials,
  })
}
const notRequested = {
  status: "notRequested",
  content: null,
  viewedBeforeSubmission: false,
} as const
const personalized = {
  status: "revealed",
  content: answerFor(projectQuestion),
  viewedBeforeSubmission: false,
} as const
const technical = {
  status: "revealed",
  content: answerFor(technicalQuestion),
  viewedBeforeSubmission: false,
} as const
const request = fn(async () => "executed" as const)

function Answering({
  state = notRequested,
  onRequest = request,
  isPending = false,
  assistedRetry = false,
}: {
  state?: PracticeReferenceAnswerState
  onRequest?: () => Promise<"executed">
  isPending?: boolean
  assistedRetry?: boolean
}) {
  return (
    <PracticeReferenceAnswer
      assistedRetry={assistedRetry}
      interactionLocked={isPending}
      isPending={isPending}
      mode="answering"
      onRequest={onRequest}
      state={state}
    />
  )
}

const meta = preview.meta({ title: "Practice/PracticeReferenceAnswer" })

export const NotRequested = meta.story({ render: () => <Answering /> })

function ConfirmationStory() {
  const [state, setState] = useState<PracticeReferenceAnswerState>(notRequested)
  return (
    <Answering
      onRequest={async () => {
        await request()
        setState(personalized)
        return "executed"
      }}
      state={state}
    />
  )
}

export const Confirmation = meta.story({
  render: () => <ConfirmationStory />,
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /RIVA 示例回答|RIVA example answer/i }),
    )
    await expect(request).not.toHaveBeenCalled()
    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(
      within(dialog).getByRole("button", { name: /查看示例回答|view example/i }),
    )
    await expect(request).toHaveBeenCalledTimes(1)
    await expect(canvas.getByText(personalized.content.answer)).toBeVisible()
  },
})

export const Generating = meta.story({
  render: () => <Answering isPending />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /正在生成|generating/i })).toBeDisabled()
  },
})

export const PersonalizedExample = meta.story({
  render: () => <Answering state={personalized} />,
})

export const TechnicalReference = meta.story({
  render: () => <Answering state={technical} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/技术参考答案|technical reference answer/i)).toBeVisible()
  },
})

export const ViewedBeforeSubmission = meta.story({
  render: () => <Answering state={{ ...personalized, viewedBeforeSubmission: true }} />,
})

export const Unavailable = meta.story({
  render: () => (
    <Answering state={{ status: "unavailable", content: null, viewedBeforeSubmission: false }} />
  ),
})

const rejectedRequest = fn(async () => {
  throw new Error("internal secret reference error")
})
export const RequestError = meta.story({
  render: () => <Answering onRequest={rejectedRequest} />,
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /RIVA 示例回答|RIVA example answer/i }),
    )
    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(
      within(dialog).getByRole("button", { name: /查看示例回答|view example/i }),
    )
    await waitFor(() => expect(canvas.getByRole("alert")).toBeVisible())
    await expect(screen.queryByText("internal secret reference error")).not.toBeInTheDocument()
  },
})

export const RecordReadOnly = meta.story({
  render: () => <PracticeReferenceAnswer mode="readonly" state={personalized} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /展开参考答案|expand reference/i }))
    await expect(canvas.getByText(personalized.content.answer)).toBeVisible()
  },
})

export const LongContent = meta.story({
  render: () => (
    <Answering
      state={{
        ...personalized,
        content: {
          ...personalized.content,
          answer: `${personalized.content.answer}\n\n${"averylongtechnicalidentifier".repeat(20)}`,
        },
      }}
    />
  ),
})
