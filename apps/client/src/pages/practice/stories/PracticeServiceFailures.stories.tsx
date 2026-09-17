import preview from "#storybook/preview"
import { useRef, useState } from "react"
import { expect, userEvent } from "storybook/test"
import { withRouter } from "#storybook/decorators/with-router"
import { PracticeView } from "../PracticeView"
import { createPracticeViewArgs } from "./practice-story-fixtures"

type Failure = "load" | "start" | "generation" | "processing"

function PracticeServiceFailureStory({ failure }: { failure: Failure }) {
  const [recovered, setRecovered] = useState(false)
  const attempted = useRef(false)
  const recover = () => setRecovered(true)
  if (failure === "load" && !recovered) {
    return <PracticeView variant="error" isRetrying={false} onRetry={recover} />
  }
  const args = createPracticeViewArgs(
    failure === "processing"
      ? recovered
        ? "reviewBalanced"
        : "processingAnswer"
      : failure === "generation"
        ? recovered
          ? "answeringQuestion"
          : "generatingQuestion"
        : failure === "start" && recovered
          ? "generatingQuestion"
          : "setupReady",
  )
  return (
    <PracticeView
      {...args}
      taskError={(failure === "generation" || failure === "processing") && !recovered}
      onRetryTask={recover}
      onStart={async () => {
        if (!attempted.current) {
          attempted.current = true
          throw new Error("Private request detail")
        }
        recover()
      }}
    />
  )
}

const meta = preview.meta({
  component: PracticeServiceFailureStory,
  decorators: [withRouter],
  parameters: { controls: { disable: true }, router: { initialEntries: ["/practice"] } },
  title: "Pages/Practice/Service failures",
})

export const PageLoadFailureRetry = meta.story({
  args: { failure: "load" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /重新加载|reload/i }))
    await expect(await canvas.findByTestId("practice-setup-state")).toBeVisible()
  },
})

export const StartFailureRetry = meta.story({
  args: { failure: "start" },
  play: async ({ canvas }) => {
    const start = canvas.getByRole("button", { name: /开始练习|start practice/i })
    await userEvent.click(start)
    await expect(await canvas.findByRole("alert")).toBeVisible()
    await userEvent.click(start)
    await expect(await canvas.findByTestId("practice-generating-state")).toBeVisible()
  },
})

export const TaskFailureBeforeQuestionRetry = meta.story({
  args: { failure: "generation" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /重新尝试|try again/i }))
    await expect(await canvas.findByTestId("practice-answering-state")).toBeVisible()
  },
})

export const TaskFailureAfterAnswerRetry = meta.story({
  args: { failure: "processing" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByTestId("practice-task-failure")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /重新尝试|try again/i }))
    await expect(await canvas.findByTestId("practice-review-state")).toBeVisible()
  },
})
