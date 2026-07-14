import preview from "#storybook/preview"

import { dashboardResponseMock } from "@/mocks/data/dashboard"

import { withRouter } from "#storybook/decorators/with-router"
import { WeaknessesCard } from "./WeaknessesCard"

const meta = preview.meta({
  component: WeaknessesCard,
  decorators: [withRouter],
  parameters: {
    router: {
      initialEntries: ["/dashboard"],
    },
  },
  title: "Pages/Dashboard/WeaknessesCard",
})

export const Default = meta.story({
  args: {
    state: { data: dashboardResponseMock.weaknesses, status: "ready" },
  },
})

export const Loading = meta.story({
  args: {
    state: { status: "loading" },
  },
})

export const Empty = meta.story({
  args: {
    state: { data: [], status: "ready" },
  },
})
