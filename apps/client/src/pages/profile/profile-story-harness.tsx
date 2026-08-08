import { useEffect, useState } from "react"
import { fn } from "storybook/test"

import { createProfileMockSnapshot, type ProfileMockScenario } from "@/mocks/data/profile"
import type { JobProfile, JobProfileSnapshot, SaveProfileSectionInput } from "@/models/profile"

import { ProfileView, type ProfileViewActions } from "./ProfileView"

type ProfileStoryHarnessProps = {
  advanceDelay?: number
  autoAdvance?: boolean
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

function useStoryLifecycle({
  enabled,
  advanceDelay,
  snapshot,
  setSnapshot,
}: {
  advanceDelay: number
  enabled: boolean
  snapshot: JobProfileSnapshot
  setSnapshot: (next: JobProfileSnapshot) => void
}) {
  const profileStatus = snapshot.profile?.status
  const resumeUpdateStatus = snapshot.resumeUpdate?.status

  useEffect(() => {
    if (!enabled) return
    if (profileStatus !== "uploadingResume" && profileStatus !== "parsingResume") return

    const next =
      profileStatus === "uploadingResume"
        ? createProfileMockSnapshot("initialResumeRecognizing")
        : createProfileMockSnapshot("initialResumeRecognitionSucceeded")
    if (advanceDelay === 0) {
      setSnapshot(next)
      return
    }
    const timeout = window.setTimeout(() => setSnapshot(next), advanceDelay)
    return () => window.clearTimeout(timeout)
  }, [advanceDelay, enabled, profileStatus, setSnapshot])

  useEffect(() => {
    if (!enabled) return
    if (resumeUpdateStatus !== "uploading" && resumeUpdateStatus !== "parsing") return

    const next =
      resumeUpdateStatus === "uploading"
        ? createProfileMockSnapshot("resumeUpdateRecognizing")
        : createProfileMockSnapshot("resumeUpdateSucceeded")
    if (advanceDelay === 0) {
      setSnapshot(next)
      return
    }
    const timeout = window.setTimeout(() => setSnapshot(next), advanceDelay)
    return () => window.clearTimeout(timeout)
  }, [advanceDelay, enabled, resumeUpdateStatus, setSnapshot])
}

export function ProfileStoryHarness({
  advanceDelay = 0,
  autoAdvance = false,
  hasResumeDocuments,
  scenario,
}: ProfileStoryHarnessProps) {
  const [snapshot, setSnapshot] = useState(() => createProfileMockSnapshot(scenario))
  useStoryLifecycle({ advanceDelay, enabled: autoAdvance, snapshot, setSnapshot })

  const actions: ProfileViewActions = {
    applyResumeDraft: fn(async () => undefined),
    createManualProfile: fn(async () => {
      const next = createProfileMockSnapshot("emptyManualProfile")
      setSnapshot(next)
      return next
    }),
    resetInitialResumeImport: fn(async () => {
      const next = createProfileMockSnapshot("noProfile")
      setSnapshot(next)
      return next
    }),
    resetResumeWorkflow: fn(() => undefined),
    retryRecognition: fn(async () => {
      const next = createProfileMockSnapshot("initialResumeRecognizing")
      setSnapshot(next)
      return next
    }),
    retryResumeWorkflow: fn(async () => undefined),
    saveSection: fn(async (input) => {
      if (!snapshot.profile) throw new Error("A profile is required to save a section.")
      const profile = replaceSection(structuredClone(snapshot.profile), input)
      setSnapshot({ ...snapshot, profile })
      return profile
    }),
    uploadInitialResume: fn(async () => {
      const next = createProfileMockSnapshot("initialResumeUploading")
      setSnapshot(next)
      return next
    }),
    uploadUpdatedResume: fn(async () => {
      const next = createProfileMockSnapshot("resumeUpdateUploading")
      setSnapshot(next)
      return next
    }),
  }

  return (
    <ProfileView
      actions={actions}
      content={{ status: "ready", data: snapshot, hasResumeDocuments }}
      variant="default"
    />
  )
}
