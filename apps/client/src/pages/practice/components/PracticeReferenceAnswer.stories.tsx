import preview from "#storybook/preview"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import { useState } from "react"

import { createPracticeReferenceAnswer } from "@/mocks/data/practice"

import { PracticeReferenceAnswer } from "./PracticeReferenceAnswer"

const notRequested = {
  status: "notRequested",
  content: null,
  viewedBeforeSubmission: false,
} as const
const personalized = {
  status: "revealed",
  content: createPracticeReferenceAnswer("projectDeepDive"),
  viewedBeforeSubmission: false,
} as const
const technical = {
  status: "revealed",
  content: createPracticeReferenceAnswer("technicalFoundation"),
  viewedBeforeSubmission: false,
} as const

const meta = preview.meta({
  component: PracticeReferenceAnswer,
  title: "Practice/PracticeReferenceAnswer",
})

export const NotRequested = meta.story({ args: { state: notRequested } })

const confirmRequest = fn(async () => "executed" as const)

function ConfirmationStory() {
  const [state, setState] = useState(notRequested as typeof notRequested | typeof personalized)
  return (
    <PracticeReferenceAnswer
      onRequest={async () => {
        await confirmRequest()
        setState(personalized)
        return "executed"
      }}
      state={state}
    />
  )
}

export const Confirmation = meta.story({
  args: { onRequest: confirmRequest, state: notRequested },
  render: () => <ConfirmationStory />,
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /RIVA 示例回答|RIVA example answer/i }),
    )
    await expect(confirmRequest).not.toHaveBeenCalled()
    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(
      within(dialog).getByRole("button", { name: /查看示例回答|view example/i }),
    )
    await expect(confirmRequest).toHaveBeenCalledTimes(1)
    await expect(canvas.getByText(personalized.content.answer)).toBeVisible()
  },
})

export const Generating = meta.story({
  args: { isPending: true, state: notRequested },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /正在生成|generating/i })).toBeDisabled()
  },
})

export const PersonalizedExample = meta.story({ args: { state: personalized } })

export const TechnicalReference = meta.story({
  args: { state: technical },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/技术参考答案|technical reference answer/i)).toBeVisible()
  },
})

export const ViewedBeforeSubmission = meta.story({
  args: { state: { ...personalized, viewedBeforeSubmission: true } },
})

export const Unavailable = meta.story({
  args: {
    state: { status: "unavailable", content: null, viewedBeforeSubmission: false },
  },
})

const rejectedRequest = fn(async () => {
  throw new Error("internal secret reference error")
})
export const RequestError = meta.story({
  args: { onRequest: rejectedRequest, state: notRequested },
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
  args: { mode: "readonly", state: personalized },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /展开参考答案|expand reference/i }))
    await expect(canvas.getByText(personalized.content.answer)).toBeVisible()
  },
})

export const LongContent = meta.story({
  args: {
    state: {
      ...personalized,
      content: {
        ...personalized.content,
        answer: `${personalized.content.answer}\n\n${"averylongtechnicalidentifier".repeat(20)}`,
      },
    },
  },
})
