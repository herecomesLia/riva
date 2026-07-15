import preview from "#storybook/preview"
import { fn } from "storybook/test"

import { profileResponseMock } from "@/mocks/data/profile"

import { ProfileSectionEditDialog } from "./ProfileSectionEditDialog"

const meta = preview.meta({
  component: ProfileSectionEditDialog,
  title: "Profile/ProfileSectionEditDialog",
})

function createArgs(
  section: "education" | "workExperience" | "projectExperience" | "skills" | "credentials",
) {
  return {
    onDirtyChange: fn(),
    onOpenChange: fn(),
    onSave: fn(async () => {}),
    open: true,
    profile: structuredClone(profileResponseMock.profile!),
    section,
  }
}

export const Education = meta.story({ args: createArgs("education") })

export const WorkExperience = meta.story({ args: createArgs("workExperience") })

export const ProjectExperience = meta.story({ args: createArgs("projectExperience") })

export const Skills = meta.story({ args: createArgs("skills") })

export const Credentials = meta.story({ args: createArgs("credentials") })
