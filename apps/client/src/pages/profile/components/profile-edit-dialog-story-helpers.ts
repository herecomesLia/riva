import { fn } from "storybook/test"

import { profileResponseMock } from "@/mocks/data/profile"
import type { JobProfile } from "@/models/profile"

import type { EditableProfileSection } from "./ProfileSectionEditDialog"

export function createProfileEditDialogArgs(
  section: EditableProfileSection,
  profile = profileResponseMock.profile!,
) {
  return {
    onDirtyChange: fn(),
    onOpenChange: fn(),
    onSave: fn(async () => {}),
    open: true,
    profile: structuredClone(profile) as JobProfile,
    section,
  }
}
