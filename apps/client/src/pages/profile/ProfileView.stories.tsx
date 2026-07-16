import preview from "#storybook/preview"
import { fn } from "storybook/test"

import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfileSnapshot } from "@/models/profile"

import { withRouter } from "#storybook/decorators/with-router"
import { ProfileView, type ProfileViewActions } from "./ProfileView"

const actions: ProfileViewActions = {
  createManualProfile: fn(async () => structuredClone(profileResponseMock)),
  resetInitialResumeImport: fn(async () => structuredClone(profileResponseMock)),
  retryRecognition: fn(async () => structuredClone(profileResponseMock)),
  saveSection: fn(async () => structuredClone(profileResponseMock.profile!)),
  uploadInitialResume: fn(async () => structuredClone(profileResponseMock)),
  uploadUpdatedResume: fn(async () => structuredClone(profileResponseMock)),
}

const readyArgs = {
  actions,
  content: { status: "ready" as const, data: structuredClone(profileResponseMock) },
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

const afterInitialImport: JobProfileSnapshot = structuredClone(profileResponseMock)
afterInitialImport.matchingAnalysis = null

export const AfterInitialImport = meta.story({
  args: { ...readyArgs, content: { status: "ready", data: afterInitialImport } },
})

const empty = structuredClone(profileResponseMock)
empty.profile!.education = []
empty.profile!.workExperiences = []
empty.profile!.projectExperiences = []
empty.profile!.skills = []

export const EmptyProfile = meta.story({
  args: { ...readyArgs, content: { status: "ready", data: empty } },
})

const partial = structuredClone(profileResponseMock)
partial.profile!.projectExperiences = []
partial.profile!.credentials = []
partial.profile!.completeness.percentage = 75
partial.profile!.completeness.missingSections = ["projectExperience", "credentials"]

export const Partial = meta.story({
  args: { ...readyArgs, content: { status: "ready", data: partial } },
})

const afterResumeUpdate: JobProfileSnapshot = structuredClone(profileResponseMock)
afterResumeUpdate.resumeUpdate = {
  changeSummary: { changedItems: 2, missingItems: 1, newItems: 1 },
  createdAt: "2026-07-13T08:00:00.000Z",
  failureReason: null,
  id: "resume_update_uploaded",
  preservesManualChanges: true,
  resume: structuredClone(afterResumeUpdate.profile!.resume!),
  status: "succeeded",
}

export const AfterResumeUpdate = meta.story({
  args: { ...readyArgs, content: { status: "ready", data: afterResumeUpdate } },
})
