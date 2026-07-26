import preview from "#storybook/preview"

import { profileResponseMock } from "@/mocks/data/profile"

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

const currentEducation = structuredClone(profileResponseMock.profile!)
currentEducation.education[0]!.endDate = null
currentEducation.education[0]!.isCurrent = true

export const Present = meta.story({
  args: createProfileEditDialogArgs("education", currentEducation),
})
