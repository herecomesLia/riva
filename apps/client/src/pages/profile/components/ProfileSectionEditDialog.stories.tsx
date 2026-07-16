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

export const EducationEnglish = meta.story({
  args: createArgs("education"),
  globals: { locale: "en" },
})

const currentEducation = structuredClone(profileResponseMock.profile!)
currentEducation.education[0]!.endDate = null
currentEducation.education[0]!.isCurrent = true

export const EducationPresent = meta.story({
  args: { ...createArgs("education"), profile: currentEducation },
})

export const WorkExperience = meta.story({ args: createArgs("workExperience") })

const structuredBulletsProfile = structuredClone(profileResponseMock.profile!)
structuredBulletsProfile.workExperiences[0]!.responsibilities = [
  "负责前端架构设计",
  "维护公共组件库",
]
structuredBulletsProfile.workExperiences[0]!.achievements = ["提升核心流程性能", "建立无障碍规范"]

export const WorkExperienceStructuredBullets = meta.story({
  args: { ...createArgs("workExperience"), profile: structuredBulletsProfile },
})

export const WorkExperienceParagraphPaste = meta.story({
  args: { ...createArgs("workExperience"), profile: structuredBulletsProfile },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getAllByRole("button", { name: /批量粘贴并整理|paste and organize/i })[0]!,
    )
    await userEvent.type(
      canvas.getByRole("textbox", { name: /粘贴内容|paste content/i }),
      "负责前端架构设计。维护公共组件库和无障碍规范。推动性能优化。",
    )
    await userEvent.click(
      canvas.getByRole("button", { name: /预览整理结果|preview organized result/i }),
    )
  },
})

export const WorkExperienceBulletPaste = meta.story({
  args: { ...createArgs("workExperience"), profile: structuredBulletsProfile },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getAllByRole("button", { name: /批量粘贴并整理|paste and organize/i })[0]!,
    )
    await userEvent.type(
      canvas.getByRole("textbox", { name: /粘贴内容|paste content/i }),
      "- 负责架构设计\n- 维护组件库",
    )
    await userEvent.click(
      canvas.getByRole("button", { name: /预览整理结果|preview organized result/i }),
    )
  },
})

export const WorkExperienceAmbiguousParagraph = meta.story({
  args: { ...createArgs("workExperience"), profile: structuredBulletsProfile },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getAllByRole("button", { name: /批量粘贴并整理|paste and organize/i })[0]!,
    )
    await userEvent.type(
      canvas.getByRole("textbox", { name: /粘贴内容|paste content/i }),
      "负责商家工作台前端架构设计，维护组件库",
    )
    await userEvent.click(
      canvas.getByRole("button", { name: /预览整理结果|preview organized result/i }),
    )
  },
})

export const WorkExperienceExistingSkills = meta.story({
  args: { ...createArgs("workExperience"), profile: structuredBulletsProfile },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getAllByRole("combobox", { name: /搜索或输入技能|search or enter a skill/i })[0]!,
      "React",
    )
    await userEvent.keyboard("{Enter}")
  },
})

export const WorkExperienceBatchSkills = meta.story({
  args: { ...createArgs("workExperience"), profile: structuredBulletsProfile },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getAllByRole("combobox", { name: /搜索或输入技能|search or enter a skill/i })[0]!,
      "React, TypeScript；Design systems",
    )
    await userEvent.keyboard("{Enter}")
  },
})

export const WorkExperienceDuplicateSkill = meta.story({
  args: { ...createArgs("workExperience"), profile: structuredBulletsProfile },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getAllByRole("combobox", { name: /搜索或输入技能|search or enter a skill/i })[0]!,
      "react",
    )
    await userEvent.keyboard("{Enter}")
  },
})

export const WorkExperienceNewSkill = meta.story({
  args: { ...createArgs("workExperience"), profile: structuredBulletsProfile },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getAllByRole("combobox", { name: /搜索或输入技能|search or enter a skill/i })[0]!,
      "Accessibility",
    )
    await userEvent.keyboard("{Enter}")
  },
})

export const ProjectExperience = meta.story({ args: createArgs("projectExperience") })

const structuredProjectProfile = structuredClone(profileResponseMock.profile!)
structuredProjectProfile.projectExperiences[0]!.responsibilities = [
  "设计并交付商家工作台的核心流程。",
  "维护共享组件与无障碍规范。",
]
structuredProjectProfile.projectExperiences[0]!.achievements = [
  "提升核心流程性能。",
  "缩短商家支持响应时间。",
]

export const ProjectExperienceStructuredContent = meta.story({
  args: { ...createArgs("projectExperience"), profile: structuredProjectProfile },
})

export const ProjectExperiencePasteAndOrganize = meta.story({
  args: { ...createArgs("projectExperience"), profile: structuredProjectProfile },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getAllByRole("button", { name: /批量粘贴并整理|paste and organize/i })[0]!,
    )
    await userEvent.type(
      canvas.getByRole("textbox", { name: /粘贴内容|paste content/i }),
      "负责前端架构设计。维护公共组件库和无障碍规范。推动性能优化。",
    )
    await userEvent.click(
      canvas.getByRole("button", { name: /预览整理结果|preview organized result/i }),
    )
  },
})

export const ProjectExperienceExistingTechnology = meta.story({
  args: { ...createArgs("projectExperience"), profile: structuredProjectProfile },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole("combobox", { name: /搜索或输入技能|search or enter a skill/i }),
      "React",
    )
    await userEvent.keyboard("{Enter}")
  },
})

export const ProjectExperienceNewTechnology = meta.story({
  args: { ...createArgs("projectExperience"), profile: structuredProjectProfile },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole("combobox", { name: /搜索或输入技能|search or enter a skill/i }),
      "Accessibility",
    )
    await userEvent.keyboard("{Enter}")
  },
})

export const ProjectExperienceBatchTechnology = meta.story({
  args: { ...createArgs("projectExperience"), profile: structuredProjectProfile },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole("combobox", { name: /搜索或输入技能|search or enter a skill/i }),
      "React, TypeScript；TanStack Query",
    )
    await userEvent.keyboard("{Enter}")
  },
})

export const Skills = meta.story({ args: createArgs("skills") })

const fiveSkills = structuredClone(profileResponseMock.profile!)
fiveSkills.skills.push({
  id: "skill_accessibility",
  name: "Accessibility and inclusive design",
  source: "userAdded",
})

export const FiveSkills = meta.story({
  args: { ...createArgs("skills"), profile: fiveSkills },
})

export const Credentials = meta.story({ args: createArgs("credentials") })

export const CredentialsEnglish = meta.story({
  args: createArgs("credentials"),
  globals: { locale: "en" },
})
