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
empty.profile!.credentials = []

export const EmptySections = meta.story({
  args: { ...readyArgs, content: { status: "ready", data: empty } },
})

const multipleEducation = structuredClone(profileResponseMock)
multipleEducation.profile!.education.push({
  degree: "Master of Science",
  endDate: "2021-06",
  id: "education_riva_2021",
  isCurrent: false,
  major: "Human-Computer Interaction",
  school: "Riva University",
  source: "userAdded",
  startDate: "2018-09",
})

export const MultipleEducation = meta.story({
  args: { ...readyArgs, content: { status: "ready", data: multipleEducation } },
})

const singleCredential = structuredClone(profileResponseMock)
singleCredential.profile!.credentials = singleCredential.profile!.credentials.slice(0, 1)

export const SingleCredential = meta.story({
  args: { ...readyArgs, content: { status: "ready", data: singleCredential } },
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

const longContent = structuredClone(profileResponseMock)
longContent.profile!.education[0]!.school =
  "Fudan University School of Computer Science and Technology International Program"
longContent.profile!.education[0]!.major =
  "Computer Science and Technology with Human-Centered Product Design"
longContent.profile!.credentials[0]!.credentialUrl =
  "https://credentials.example.com/verification/this-is-a-deliberately-long-unbroken-credential-verification-token-for-layout-checking"
longContent.profile!.projectExperiences[0]!.background =
  "A product-focused engineer who works across accessibility, design systems, performance, architecture, and cross-functional delivery. ".repeat(
    5,
  )

export const LongContent = meta.story({
  args: { ...readyArgs, content: { status: "ready", data: longContent } },
})
