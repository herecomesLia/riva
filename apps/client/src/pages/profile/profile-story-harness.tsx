import { useState } from "react"
import { fn } from "storybook/test"

import { createProfileMockSnapshot, type ProfileMockScenario } from "@/mocks/data/profile"
import type { JobProfile, SaveProfileSectionInput } from "@/models/profile"

import { ProfileView, type ProfileViewActions } from "./ProfileView"

type ProfileStoryHarnessProps = {
  hasResumeDocuments?: boolean
  scenario: ProfileMockScenario
}

function replaceSection(profile: JobProfile, input: SaveProfileSectionInput): JobProfile {
  switch (input.section) {
    case "education":
      return { ...profile, education: input.values }
    case "workExperience":
      return { ...profile, workExperiences: input.values }
    case "projectExperience":
      return { ...profile, projectExperiences: input.values }
    case "skills":
      return { ...profile, skills: input.values }
    case "credentials":
      return { ...profile, credentials: input.values }
    case "targetRoles":
      return { ...profile, targetRoles: input.values }
  }
}

export function ProfileStoryHarness({ hasResumeDocuments, scenario }: ProfileStoryHarnessProps) {
  const [snapshot, setSnapshot] = useState(() => createProfileMockSnapshot(scenario))

  const actions: ProfileViewActions = {
    applyResumeDraft: fn(async () => undefined),
    createManualProfile: fn(async () => {
      const next = createProfileMockSnapshot("emptyManualProfile")
      setSnapshot(next)
      return next
    }),
    resetResumeWorkflow: fn(() => undefined),
    retryResumeWorkflow: fn(async () => undefined),
    saveSection: fn(async (input) => {
      if (!snapshot.profile) throw new Error("A profile is required to save a section.")
      const profile = replaceSection(structuredClone(snapshot.profile), input)
      setSnapshot({ ...snapshot, profile })
      return profile
    }),
    uploadResumeForInitialImport: fn(async () => snapshot),
    uploadResumeForUpdate: fn(async () => snapshot),
  }

  return (
    <ProfileView
      actions={actions}
      content={{ status: "ready", data: snapshot, hasResumeDocuments }}
      variant="default"
    />
  )
}
