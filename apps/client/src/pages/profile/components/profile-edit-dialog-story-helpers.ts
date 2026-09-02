import { fn } from "storybook/test"

import type { CareerProfileResponse } from "@/api/generated/models"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"

import type { EditableProfileSection } from "./ProfileSectionEditDialog"

export function createProfileEditDialogArgs(
  section: EditableProfileSection,
  profile: CareerProfileResponse = careerProfileFixture,
) {
  return {
    onDirtyChange: fn(),
    onOpenChange: fn(),
    onSave: fn(async () => undefined),
    open: true,
    profile: structuredClone(profile),
    section,
  }
}
