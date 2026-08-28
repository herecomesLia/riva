import { useEffect, useState } from "react"
import { fn } from "storybook/test"

import { createProfileMockSnapshot, type ProfileMockScenario } from "@/mocks/data/profile"
import type { JobProfile, JobProfileSnapshot, SaveProfileSectionInput } from "@/models/profile"

import { ProfileView, type ProfileViewActions } from "./ProfileView"

type ProfileStoryHarnessProps = {
  advanceDelay?: number
  autoAdvance?: boolean
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
  }
}

function useStoryLifecycle({
  enabled,
  advanceDelay,
  snapshot,
  setShowInitialImportFeedback,
  setSnapshot,
}: {
  advanceDelay: number
  enabled: boolean
  snapshot: JobProfileSnapshot
  setShowInitialImportFeedback: (show: boolean) => void
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
    const advance = () => {
      setSnapshot(next)
      if (next.recognition?.processingStatus === "succeeded") {
        setShowInitialImportFeedback(true)
      }
    }
    if (advanceDelay === 0) {
      advance()
      return
    }
    const timeout = window.setTimeout(advance, advanceDelay)
    return () => window.clearTimeout(timeout)
  }, [advanceDelay, enabled, profileStatus, setShowInitialImportFeedback, setSnapshot])

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
  scenario,
}: ProfileStoryHarnessProps) {
  const [snapshot, setSnapshot] = useState(() => createProfileMockSnapshot(scenario))
  const [showInitialImportFeedback, setShowInitialImportFeedback] = useState(
    scenario === "initialResumeRecognitionSucceeded",
  )
  useStoryLifecycle({
    advanceDelay,
    enabled: autoAdvance,
    snapshot,
    setShowInitialImportFeedback,
    setSnapshot,
  })

  const actions: ProfileViewActions = {
    createManualProfile: fn(async () => {
      const next = createProfileMockSnapshot("emptyManualProfile")
      setShowInitialImportFeedback(false)
      setSnapshot(next)
      return next
    }),
    resetInitialResumeImport: fn(async () => {
      const next = createProfileMockSnapshot("noProfile")
      setShowInitialImportFeedback(false)
      setSnapshot(next)
      return next
    }),
    retryRecognition: fn(async () => {
      const next = createProfileMockSnapshot("initialResumeRecognizing")
      setShowInitialImportFeedback(false)
      setSnapshot(next)
      return next
    }),
    saveSection: fn(async (input) => {
      if (!snapshot.profile) throw new Error("A profile is required to save a section.")
      const profile = replaceSection(structuredClone(snapshot.profile), input)
      setSnapshot({ ...snapshot, profile })
      return profile
    }),
    uploadInitialResume: fn(async () => {
      const next = createProfileMockSnapshot("initialResumeUploading")
      setShowInitialImportFeedback(false)
      setSnapshot(next)
      return next
    }),
    uploadUpdatedResume: fn(async () => {
      const next = createProfileMockSnapshot("resumeUpdateUploading")
      setShowInitialImportFeedback(false)
      setSnapshot(next)
      return next
    }),
  }

  return (
    <ProfileView
      actions={actions}
      content={{ status: "ready", data: snapshot, showInitialImportFeedback }}
      variant="default"
    />
  )
}
