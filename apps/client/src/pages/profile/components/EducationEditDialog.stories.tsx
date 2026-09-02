import preview from "#storybook/preview"

import type { CareerProfileResponse } from "@/api/generated/models"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"

import { ProfileSectionEditDialog } from "./ProfileSectionEditDialog"
import { createProfileEditDialogArgs } from "./profile-edit-dialog-story-helpers"

const meta = preview.meta({
  component: ProfileSectionEditDialog,
  title: "Profile/Education/EditDialog",
})

export const Default = meta.story({ args: createProfileEditDialogArgs("education") })

export const English = meta.story({
  args: createProfileEditDialogArgs("education"),
  globals: { locale: "en" },
})

const currentEducation: CareerProfileResponse = structuredClone(careerProfileFixture)
currentEducation.education[0]!.endDate = null

export const Present = meta.story({
  args: createProfileEditDialogArgs("education", currentEducation),
})
