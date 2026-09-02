import { useState } from "react"
import { fn } from "storybook/test"

import type { CareerProfileResponse } from "@/api/generated/models"
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
  const actions: ProfileViewActions = {
    createProfile: fn(async () => {
      const next = structuredClone(careerProfileFixture)
      setProfile(next)
      return next
    }),
    importResume: fn(async () => {
      const next = structuredClone(resumeImportedCareerProfileFixture)
      setProfile(next)
      return next
    }),
    updateProfile: fn(async (input) => {
      if (!profile) throw new Error("A profile is required for update.")
      const next = { ...profile, ...structuredClone(input) }
      setProfile(next)
      return next
    }),
  }

  return (
    <ProfileView actions={actions} content={{ status: "ready", data: profile }} variant="default" />
  )
}
