import preview from "#storybook/preview"

import { ProfileSectionEditDialog } from "./ProfileSectionEditDialog"
import { createProfileEditDialogArgs } from "./profile-edit-dialog-story-helpers"

const meta = preview.meta({
  component: ProfileSectionEditDialog,
  title: "Profile/Credentials/EditDialog",
})

export const Default = meta.story({ args: createProfileEditDialogArgs("credentials") })

export const English = meta.story({
  args: createProfileEditDialogArgs("credentials"),
  globals: { locale: "en" },
})
