import preview from "#storybook/preview"

import { dashboardResponseMock } from "@/mocks/data/dashboard"

import { withRouter } from "#storybook/decorators/with-router"
import { CurrentRoleCard } from "./CurrentRoleCard"

const defaultRole = dashboardResponseMock.currentRole!

const profileIncompleteRole = {
  ...defaultRole,
  profileCompleted: false,
} satisfies NonNullable<typeof dashboardResponseMock.currentRole>

const jobDescriptionMissingRole = {
  ...defaultRole,
  jobDescriptionAdded: false,
} satisfies NonNullable<typeof dashboardResponseMock.currentRole>

const meta = preview.meta({
  component: CurrentRoleCard,
  decorators: [withRouter],
  parameters: {
    router: {
      initialEntries: ["/dashboard"],
    },
  },
  title: "Pages/Dashboard/CurrentRoleCard",
})

export const Default = meta.story({
  args: {
    state: { data: defaultRole, status: "ready" },
  },
})

export const Loading = meta.story({
  args: {
    state: { status: "loading" },
  },
})

export const Empty = meta.story({
  args: {
    state: { data: null, status: "ready" },
  },
})

export const ProfileIncomplete = meta.story({
  args: {
    state: { data: profileIncompleteRole, status: "ready" },
  },
})

export const JobDescriptionMissing = meta.story({
  args: {
    state: { data: jobDescriptionMissingRole, status: "ready" },
  },
})
