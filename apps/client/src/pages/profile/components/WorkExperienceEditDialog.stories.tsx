import preview from "#storybook/preview"
import { screen } from "storybook/test"

import { profileResponseMock } from "@/mocks/data/profile"

import { ProfileSectionEditDialog } from "./ProfileSectionEditDialog"
import { createProfileEditDialogArgs } from "./profile-edit-dialog-story-helpers"

const meta = preview.meta({
  component: ProfileSectionEditDialog,
  title: "Profile/WorkExperience/EditDialog",
})

export const Default = meta.story({ args: createProfileEditDialogArgs("workExperience") })

const structuredBulletsProfile = structuredClone(profileResponseMock.profile!)
structuredBulletsProfile.workExperiences[0]!.responsibilities = [
  "负责前端架构设计",
  "维护公共组件库",
]
structuredBulletsProfile.workExperiences[0]!.achievements = ["提升核心流程性能", "建立无障碍规范"]

export const StructuredBullets = meta.story({
  args: createProfileEditDialogArgs("workExperience", structuredBulletsProfile),
})

export const ParagraphPaste = meta.story({
  args: createProfileEditDialogArgs("workExperience", structuredBulletsProfile),
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

export const BulletPaste = meta.story({
  args: createProfileEditDialogArgs("workExperience", structuredBulletsProfile),
  play: async ({ userEvent }) => {
    await userEvent.click(
      screen.getAllByRole("button", { name: /批量粘贴并整理|paste and organize/i })[0]!,
    )
    await userEvent.type(
      screen.getByRole("textbox", { name: /粘贴内容|paste content/i }),
      "- 负责架构设计\n- 维护组件库",
    )
    await userEvent.click(
      screen.getByRole("button", { name: /预览整理结果|preview organized result/i }),
    )
  },
})

export const AmbiguousParagraph = meta.story({
  args: createProfileEditDialogArgs("workExperience", structuredBulletsProfile),
  play: async ({ userEvent }) => {
    await userEvent.click(
      screen.getAllByRole("button", { name: /批量粘贴并整理|paste and organize/i })[0]!,
    )
    await userEvent.type(
      screen.getByRole("textbox", { name: /粘贴内容|paste content/i }),
      "负责商家工作台前端架构设计，维护组件库",
    )
    await userEvent.click(
      screen.getByRole("button", { name: /预览整理结果|preview organized result/i }),
    )
  },
})

export const ExistingSkills = meta.story({
  args: createProfileEditDialogArgs("workExperience", structuredBulletsProfile),
  play: async ({ userEvent }) => {
    await userEvent.type(
      screen.getAllByRole("combobox", { name: /搜索或输入技能|search or enter a skill/i })[0]!,
      "React",
    )
    await userEvent.keyboard("{Enter}")
  },
})

export const BatchSkills = meta.story({
  args: createProfileEditDialogArgs("workExperience", structuredBulletsProfile),
  play: async ({ userEvent }) => {
    await userEvent.type(
      screen.getAllByRole("combobox", { name: /搜索或输入技能|search or enter a skill/i })[0]!,
      "React, TypeScript；Design systems",
    )
    await userEvent.keyboard("{Enter}")
  },
})

export const DuplicateSkill = meta.story({
  args: createProfileEditDialogArgs("workExperience", structuredBulletsProfile),
  play: async ({ userEvent }) => {
    await userEvent.type(
      screen.getAllByRole("combobox", { name: /搜索或输入技能|search or enter a skill/i })[0]!,
      "react",
    )
    await userEvent.keyboard("{Enter}")
  },
})

export const NewSkill = meta.story({
  args: createProfileEditDialogArgs("workExperience", structuredBulletsProfile),
  play: async ({ userEvent }) => {
    await userEvent.type(
      screen.getAllByRole("combobox", { name: /搜索或输入技能|search or enter a skill/i })[0]!,
      "Accessibility",
    )
    await userEvent.keyboard("{Enter}")
  },
})
