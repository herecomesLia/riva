import preview from "#storybook/preview"

import { dashboardResponseMock } from "@/mocks/data/dashboard"
import type { DashboardResponse } from "@/models/dashboard"

import { withRouter } from "#storybook/decorators/with-router"
import { CurrentRoleCard } from "./CurrentRoleCard"

type CurrentRole = NonNullable<DashboardResponse["currentRole"]>

function createRole(overrides: Partial<CurrentRole>): CurrentRole {
  return {
    ...dashboardResponseMock.currentRole!,
    ...overrides,
  }
}

const defaultRole = createRole({
  jobDescriptionAdded: true,
  profileCompleted: true,
})

const profileIncompleteRole = createRole({
  jobDescriptionAdded: true,
  profileCompleted: false,
})

const jobDescriptionMissingRole = createRole({
  jobDescriptionAdded: false,
  profileCompleted: true,
})

const bothIncompleteRole = createRole({
  jobDescriptionAdded: false,
  profileCompleted: false,
})

const minimumExperienceRole = createRole({
  experienceYears: { min: 5, max: null },
})

const maximumExperienceRole = createRole({
  experienceYears: { min: null, max: 3 },
})

const noExperienceRangeRole = createRole({
  experienceYears: null,
})

const meta = preview.meta({
  component: CurrentRoleCard,
  decorators: [withRouter],
  parameters: {
    router: {
      initialEntries: ["/dashboard"],
    },
  },
  title: "Dashboard/CurrentRoleCard",
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

export const BothIncomplete = meta.story({
  args: {
    state: { data: bothIncompleteRole, status: "ready" },
  },
})

export const MinimumExperience = meta.story({
  args: {
    state: { data: minimumExperienceRole, status: "ready" },
  },
})

export const MaximumExperience = meta.story({
  args: {
    state: { data: maximumExperienceRole, status: "ready" },
  },
})

export const NoExperienceRange = meta.story({
  args: {
    state: { data: noExperienceRangeRole, status: "ready" },
  },
})
