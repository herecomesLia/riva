import preview from "#storybook/preview"
import { screen } from "storybook/test"

import { careerProfileFixture } from "@/mocks/fixtures/career-profile"

import { ProfileSectionEditDialog } from "./ProfileSectionEditDialog"
import { createProfileEditDialogArgs } from "./profile-edit-dialog-story-helpers"

const meta = preview.meta({
  component: ProfileSectionEditDialog,
  title: "Profile/ProjectExperience/EditDialog",
})

export const Default = meta.story({ args: createProfileEditDialogArgs("projectExperience") })

const structuredProjectProfile = structuredClone(careerProfileFixture)
structuredProjectProfile.projects[0]!.description = [
  "设计并交付商家工作台的核心流程。",
  "维护共享组件与无障碍规范。",
]
structuredProjectProfile.projects[0]!.achievements = [
  "提升核心流程性能。",
  "缩短商家支持响应时间。",
]

export const StructuredContent = meta.story({
  args: createProfileEditDialogArgs("projectExperience", structuredProjectProfile),
})

export const PasteAndOrganize = meta.story({
  args: createProfileEditDialogArgs("projectExperience", structuredProjectProfile),
  play: async ({ userEvent }) => {
    await userEvent.click(
      screen.getAllByRole("button", { name: /批量粘贴并整理|paste and organize/i })[0]!,
    )
    await userEvent.type(
      screen.getByRole("textbox", { name: /粘贴内容|paste content/i }),
      "负责前端架构设计。维护公共组件库和无障碍规范。推动性能优化。",
    )
    await userEvent.click(
      screen.getByRole("button", { name: /预览整理结果|preview organized result/i }),
    )
  },
})

export const ExistingTechnology = meta.story({
  args: createProfileEditDialogArgs("projectExperience", structuredProjectProfile),
  play: async ({ userEvent }) => {
    await userEvent.type(
      screen.getByRole("textbox", { name: /输入技术|enter a technology/i }),
      "React",
    )
    await userEvent.keyboard("{Enter}")
  },
})

export const NewTechnology = meta.story({
  args: createProfileEditDialogArgs("projectExperience", structuredProjectProfile),
  play: async ({ userEvent }) => {
    await userEvent.type(
      screen.getByRole("textbox", { name: /输入技术|enter a technology/i }),
      "Accessibility",
    )
    await userEvent.keyboard("{Enter}")
  },
})

export const BatchTechnology = meta.story({
  args: createProfileEditDialogArgs("projectExperience", structuredProjectProfile),
  play: async ({ userEvent }) => {
    await userEvent.type(
      screen.getByRole("textbox", { name: /输入技术|enter a technology/i }),
      "React, TypeScript；TanStack Query",
    )
    await userEvent.keyboard("{Enter}")
  },
})
