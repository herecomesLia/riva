import { useEffect, useState } from "react"
import { fn } from "storybook/test"

import type { CareerProfileResponse, TaskStatusResponse } from "@/api/generated/models"
import {
  careerProfileFixture,
  resumeImportedCareerProfileFixture,
} from "@/mocks/fixtures/career-profile"

import { ProfileView, type ProfileViewActions } from "./ProfileView"

export function ProfileStoryHarness({
  initialProfile = careerProfileFixture,
}: {
  initialProfile?: CareerProfileResponse | null
}) {
  const [profile, setProfile] = useState<CareerProfileResponse | null>(() =>
    initialProfile ? structuredClone(initialProfile) : null,
  )
  const [extractionState, setExtractionState] = useState<TaskStatusResponse>({
    status: "idle",
    error: null,
  })
  useEffect(() => {
    if (extractionState.status === "idle") return
    const timer = setTimeout(() => {
      if (extractionState.status === "queued") {
        setExtractionState({ status: "running", error: null })
      } else {
        if (extractionState.status === "running")
          setProfile(structuredClone(resumeImportedCareerProfileFixture))
        setExtractionState({ status: "idle", error: null })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [extractionState])
  const actions: ProfileViewActions = {
    createCareerProfile: fn(async () => {
      const next = structuredClone(careerProfileFixture)
      setProfile(next)
      return next
    }),
    extractCareerProfileFromText: fn(async () => {
      setExtractionState({ status: "queued", error: null })
    }),
    retryCareerProfileExtraction: fn(async () => {
      setExtractionState({ status: "queued", error: null })
    }),
    abortCareerProfileExtraction: fn(async () => {
      setExtractionState({ status: "aborting", error: null })
    }),
    retryCareerProfileExtractionState: fn(async () => undefined),
    updateCareerProfile: fn(async (input) => {
      if (!profile) throw new Error("A profile is required for update.")
      const next = { ...profile, ...structuredClone(input) }
      setProfile(next)
      return next
    }),
  }

  return (
    <ProfileView
      actions={actions}
      profile={profile}
      extractionState={extractionState}
      extractionStateError={false}
      variant="default"
    />
  )
}
