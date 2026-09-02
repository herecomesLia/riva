import preview from "#storybook/preview"

import { careerProfileFixture } from "@/mocks/fixtures/career-profile"

import { ProfileSectionEditDialog } from "./ProfileSectionEditDialog"
import { createProfileEditDialogArgs } from "./profile-edit-dialog-story-helpers"

const meta = preview.meta({
  component: ProfileSectionEditDialog,
  title: "Profile/Skills/EditDialog",
})

export const Default = meta.story({ args: createProfileEditDialogArgs("skills") })

const fiveSkills = structuredClone(careerProfileFixture)
fiveSkills.skills.push("Accessibility and inclusive design")

export const FiveSkills = meta.story({
  args: createProfileEditDialogArgs("skills", fiveSkills),
})
