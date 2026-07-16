import preview from "#storybook/preview"

import { profileResponseMock } from "@/mocks/data/profile"

import { ProfileSectionEditDialog } from "./ProfileSectionEditDialog"
import { createProfileEditDialogArgs } from "./profile-edit-dialog-story-helpers"

const meta = preview.meta({
  component: ProfileSectionEditDialog,
  title: "Profile/Skills/EditDialog",
})

export const Default = meta.story({ args: createProfileEditDialogArgs("skills") })

const fiveSkills = structuredClone(profileResponseMock.profile!)
fiveSkills.skills.push({
  id: "skill_accessibility",
  name: "Accessibility and inclusive design",
  source: "userAdded",
})

export const FiveSkills = meta.story({
  args: createProfileEditDialogArgs("skills", fiveSkills),
})
