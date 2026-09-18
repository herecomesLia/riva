import preview from "#storybook/preview"
import { expect, userEvent } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import type {
  PracticeResponse,
  TaskFailureResponse,
  TaskStatusResponse,
} from "@/api/generated/models"
import { practiceResponseFixture } from "@/mocks/fixtures/practice"
import { toPracticeSession } from "@/models/practice-response"
import { createPracticeViewArgs, withReferenceAnswer } from "./practice-story-fixtures"
import { PracticeView } from "../PracticeView"

const meta = preview.meta({
  component: PracticeView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/practice"] } },
  title: "Pages/Practice/Review",
})

export const Processing = meta.story({
  args: createPracticeViewArgs("processingAnswer"),
})

export const TaskFailureWithConversation = meta.story({
  args: { ...createPracticeViewArgs("processingAnswer"), taskError: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-task-failure")).toBeVisible()
    await expect(canvas.queryByText(/unsafe|stack|exception/i)).not.toBeInTheDocument()
  },
})

export const BalancedReview = meta.story({
  args: createPracticeViewArgs("reviewBalanced"),
})

function backendArgs(practice: PracticeResponse, task: TaskStatusResponse | TaskFailureResponse) {
  const args = createPracticeViewArgs("reviewBalanced")
  return {
    ...args,
    content: {
      status: "ready" as const,
      data: { ...args.content.data, session: toPracticeSession(practice, task) },
    },
    taskError: task.status === "failed",
  }
}

export const BackendResponse = meta.story({
  args: backendArgs(practiceResponseFixture, { status: "idle", error: null }),
})

export const DeletedRoleSnapshot = meta.story({
  args: backendArgs(
    { ...practiceResponseFixture, role: { ...practiceResponseFixture.role, id: null } },
    { status: "idle", error: null },
  ),
})

const restartingResponse: PracticeResponse = {
  ...practiceResponseFixture,
  rounds: [
    {
      ...practiceResponseFixture.rounds[0],
      id: "10000000-0000-4000-8000-000000000020",
      turns: practiceResponseFixture.rounds[0].turns.slice(0, 1),
      result: null,
    },
  ],
}

export const RestartPreparing = meta.story({
  args: backendArgs(restartingResponse, { status: "running", error: null }),
})

export const RestartFailed = meta.story({
  args: backendArgs(restartingResponse, {
    status: "failed",
    error: { code: "internal_error", message: "Unable to complete the task." },
  }),
})

export const ReviewWithPersonalizedExample = meta.story({
  args: withReferenceAnswer("reviewBalanced", "project", 1),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /^查看复盘：|^View review:/i })[0])
    await expect(canvas.getByText(/我会选用推荐材料中的/)).toBeVisible()
  },
})

export const ReviewWithReactReference = meta.story({
  args: withReferenceAnswer("reviewBalanced", "technical_basics", 1),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /^查看复盘：|^View review:/i })[0])
    await expect(canvas.getByText(/React 重复渲染首先要区分/)).toBeVisible()
  },
})

export const ReviewWithRequestLayerReference = meta.story({
  args: withReferenceAnswer("reviewBalanced", "technical_basics", 2),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /^查看复盘：|^View review:/i })[0])
    await expect(canvas.getByText(/长期演进的数据请求层/)).toBeVisible()
    await expect(canvas.queryByText(/React 重复渲染首先要区分/)).not.toBeInTheDocument()
  },
})

export const LongReviewContent = meta.story({
  args: createPracticeViewArgs("reviewLongContent"),
})

export const MotivationReview = meta.story({
  args: createPracticeViewArgs("reviewMotivation"),
})

export const FollowUpEndedEarlyReview = meta.story({
  args: createPracticeViewArgs("reviewFollowUpEndedEarly"),
})

export const FollowUpReviewWithReferences = meta.story({
  args: createPracticeViewArgs("reviewBalanced"),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /^查看复盘：|^View review:/i })[0])
    await expect(canvas.getByTestId("practice-follow-up-review")).toBeVisible()
    await expect(
      canvas.getAllByRole("heading", { name: /RIVA 参考答案|RIVA reference answer/i }),
    ).not.toHaveLength(0)
  },
})

export const FollowUpEndedEarly = meta.story({
  args: createPracticeViewArgs("processingFollowUpEndedEarly"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-processing-state")).toBeVisible()
    await expect(canvas.queryByTestId("practice-follow-up-incomplete")).not.toBeInTheDocument()
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
  },
})

export const ProcessingMainAnswer = meta.story({
  args: createPracticeViewArgs("processingNoFollowUp"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-processing-state")).toBeVisible()
    await expect(canvas.queryByText(/追问 1|Follow-up 1/i)).not.toBeInTheDocument()
  },
})
