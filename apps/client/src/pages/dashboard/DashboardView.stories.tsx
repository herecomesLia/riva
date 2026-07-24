import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { dashboardResponseMock } from "@/mocks/data/dashboard"

import { withRouter } from "#storybook/decorators/with-router"
import { DashboardView } from "./DashboardView"

const meta = preview.meta({
  component: DashboardView,
  decorators: [withRouter],
  parameters: {
    router: {
      initialEntries: ["/dashboard"],
    },
  },
  title: "Pages/Dashboard",
})

export const Default = meta.story({
  args: {
    content: {
      data: dashboardResponseMock,
      status: "ready",
    },
    displayName: "测试用户",
    variant: "default",
  },
})

export const Loading = meta.story({
  args: {
    content: { status: "loading" },
    displayName: "测试用户",
    variant: "default",
  },
})

const onRetry = fn()

export const Error = meta.story({
  args: {
    onRetry,
    variant: "error",
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /重新加载|reload/i }))
    await expect(onRetry).toHaveBeenCalledTimes(1)
  },
})
