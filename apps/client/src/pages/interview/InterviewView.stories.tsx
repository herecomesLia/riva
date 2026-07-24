import preview from "#storybook/preview"
import { expect, fn, screen } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"

import { createInterviewSetupStoryFixture } from "./stories/interview-story-fixtures"
import { InterviewView } from "./InterviewView"

const meta = preview.meta({
  component: InterviewView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/interview"] } },
  title: "Pages/Interview/Setup",
})

export const Loading = meta.story({
  args: { status: "loading" },
})

export const Ready = meta.story({
  args: {
    status: "ready",
    setup: createInterviewSetupStoryFixture(),
    isStarting: false,
    onStart: fn(async () => undefined),
  },
})

export const Mobile = meta.story({
  args: {
    status: "ready",
    setup: createInterviewSetupStoryFixture(),
    isStarting: false,
    onStart: fn(async () => undefined),
  },
  globals: { viewport: { isRotated: false, value: "mobile1" } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /开始模拟面试|start mock interview/i }),
    ).toBeVisible()
  },
})

export const Starting = meta.story({
  args: {
    status: "ready",
    setup: createInterviewSetupStoryFixture(),
    isStarting: true,
    onStart: fn(async () => undefined),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /正在准备面试|preparing interview/i }),
    ).toBeDisabled()
  },
})

export const Empty = meta.story({
  args: { status: "empty" },
})

const blockedSetup = createInterviewSetupStoryFixture("prerequisiteNotMet")
if (blockedSetup.availability.status !== "blocked") {
  throw new Error("Blocked interview setup fixture required.")
}

export const PrerequisiteNotMet = meta.story({
  args: {
    status: "blocked",
    reason: blockedSetup.availability.reason,
  },
})

const onRetry = fn()

export const LoadError = meta.story({
  args: {
    status: "error",
    isRetrying: false,
    onRetry,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /重试|retry/i }))
    await expect(onRetry).toHaveBeenCalledTimes(1)
  },
})

const onStart = fn(async () => undefined)

export const StartInterview = meta.story({
  args: {
    status: "ready",
    setup: createInterviewSetupStoryFixture(),
    isStarting: false,
    onStart,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /开始模拟面试|start mock interview/i }),
    )
    await expect(onStart).toHaveBeenCalledWith(
      createInterviewSetupStoryFixture().defaultConfiguration,
    )
  },
})

const onStartProductHrBasic = fn(async () => undefined)

export const ProductHrBasic = meta.story({
  args: {
    status: "ready",
    setup: createInterviewSetupStoryFixture(),
    isStarting: false,
    onStart: onStartProductHrBasic,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByTestId("interview-target-role-trigger"))
    await userEvent.click(await screen.findByRole("option", { name: "Product Manager · Meituan" }))
    await userEvent.click(canvas.getByRole("button", { name: /基础|Basic/i }))
    await userEvent.click(
      canvas.getByRole("button", { name: /开始模拟面试|Start mock interview/i }),
    )
    await expect(onStartProductHrBasic).toHaveBeenCalledWith({
      targetRoleId: "role_product_manager_meituan",
      round: "hr",
      difficulty: "basic",
      durationMinutes: 30,
    })
  },
})

const onStartFrontendTechnicalPressure = fn(async () => undefined)

export const FrontendTechnicalPressure = meta.story({
  args: {
    status: "ready",
    setup: createInterviewSetupStoryFixture(),
    isStarting: false,
    onStart: onStartFrontendTechnicalPressure,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /开始模拟面试|Start mock interview/i }),
    )
    await expect(onStartFrontendTechnicalPressure).toHaveBeenCalledWith({
      targetRoleId: "role_frontend_bytedance",
      round: "technical",
      difficulty: "pressure",
      durationMinutes: 30,
    })
  },
})

export const StartFailure = meta.story({
  args: {
    status: "ready",
    setup: createInterviewSetupStoryFixture(),
    isStarting: false,
    onStart: fn(async () => {
      throw new Error("start failed")
    }),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /开始模拟面试|start mock interview/i }),
    )
    await expect(canvas.getByRole("alert")).toBeVisible()
  },
})
