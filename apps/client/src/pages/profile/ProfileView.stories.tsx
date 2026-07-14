import preview from "#storybook/preview"
import { fn } from "storybook/test"

import { profileResponseMock } from "@/mocks/data/profile"

import { withRouter } from "#storybook/decorators/with-router"
import { ProfileView, type ProfileViewActions } from "./ProfileView"

const actions: ProfileViewActions = {
  cancelRecognition: fn(async () => structuredClone(profileResponseMock)),
  cancelResumeUpdate: fn(async () => structuredClone(profileResponseMock)),
  confirmRecognition: fn(async () => structuredClone(profileResponseMock.profile!)),
  confirmResumeUpdate: fn(async () => structuredClone(profileResponseMock.profile!)),
  createManualProfile: fn(async () => structuredClone(profileResponseMock)),
  regenerateMatchingAnalysis: fn(async () =>
    structuredClone(profileResponseMock.matchingAnalysis!),
  ),
  retryRecognition: fn(async () => structuredClone(profileResponseMock)),
  saveSection: fn(async () => structuredClone(profileResponseMock.profile!)),
  uploadInitialResume: fn(async () => structuredClone(profileResponseMock)),
  uploadUpdatedResume: fn(async () => structuredClone(profileResponseMock)),
}

const readyArgs = {
  actions,
  content: { status: "ready" as const, data: structuredClone(profileResponseMock) },
  pending: { analysis: false, cancelUpdate: false, confirmUpdate: false },
  variant: "default" as const,
}

const meta = preview.meta({
  component: ProfileView,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/profile"] } },
  title: "Pages/Profile",
})

export const Ready = meta.story({ args: readyArgs })

export const Loading = meta.story({
  args: { content: { status: "loading" }, variant: "default" },
})

export const Error = meta.story({
  args: { onRetry: fn(), variant: "error" },
})

const noResume = structuredClone(profileResponseMock)
noResume.profile!.resume = null

export const NoResume = meta.story({
  args: { ...readyArgs, content: { status: "ready", data: noResume } },
})

const empty = structuredClone(profileResponseMock)
empty.profile!.education = []
empty.profile!.workExperiences = []
empty.profile!.projectExperiences = []
empty.profile!.skills = []
empty.profile!.credentials = []

export const EmptySections = meta.story({
  args: { ...readyArgs, content: { status: "ready", data: empty } },
})

const partial = structuredClone(profileResponseMock)
partial.profile!.basicInformation.phone = null
partial.profile!.projectExperiences = []
partial.profile!.credentials = []

export const Partial = meta.story({
  args: { ...readyArgs, content: { status: "ready", data: partial } },
})

const longContent = structuredClone(profileResponseMock)
longContent.profile!.basicInformation.personalSummary =
  "A product-focused engineer who works across accessibility, design systems, performance, architecture, and cross-functional delivery. ".repeat(
    5,
  )

export const LongContent = meta.story({
  args: { ...readyArgs, content: { status: "ready", data: longContent } },
})
