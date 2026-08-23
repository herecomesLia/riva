import preview from "#storybook/preview"
import { expect, fn, screen } from "storybook/test"

import type { TargetRole } from "@/models/roles"

import {
  createLongJobDescriptionResponse,
  createRoleStoryResponse,
} from "../stories/role-story-fixtures"
import { JobDescriptionCard } from "./JobDescriptionCard"

const meta = preview.meta({
  component: JobDescriptionCard,
  title: "Roles/JobDescriptionCard",
})

function roleFor(scenario: Parameters<typeof createRoleStoryResponse>[0]) {
  return createRoleStoryResponse(scenario).roles[0]!
}

export const Missing = meta.story({
  args: { role: roleFor("singleRoleWithoutJobDescription") },
})

const savedRole: TargetRole = {
  ...roleFor("singleRoleWithoutJobDescription"),
  jobDescription: {
    rawText: "Design and build reliable APIs.",
    status: "saved",
    version: 1,
  },
  jobDescriptionAnalysis: null,
  matchingAnalysis: null,
}
const startParsing = fn()

export const Saved = meta.story({
  args: {
    onEdit: fn(),
    onStartParsing: startParsing,
    role: savedRole,
  },
  play: async ({ userEvent }) => {
    await expect(screen.getByTestId("saved-job-description")).toHaveTextContent(
      "Design and build reliable APIs.",
    )
    await expect(screen.queryByRole("status")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /开始解析|start parsing/i }))
    await expect(startParsing).toHaveBeenCalledTimes(1)
  },
})

export const Ready = meta.story({
  args: {
    onEdit: fn(),
    role: roleFor("roleWithParsedJobDescription"),
  },
})

const onEditAnalysisModule = fn()

export const EditAnalysisModule = meta.story({
  args: {
    onEdit: fn(),
    onEditAnalysisModule,
    role: roleFor("roleWithParsedJobDescription"),
  },
  play: async ({ userEvent }) => {
    await userEvent.click(
      screen.getByRole("button", { name: /编辑 任职资格|edit qualifications/i }),
    )
    await expect(onEditAnalysisModule).toHaveBeenCalledWith("qualificationRequirements")
  },
})

export const LongContent = meta.story({
  args: {
    onEdit: fn(),
    role: createLongJobDescriptionResponse().roles[0]!,
  },
})

export const InternshipJobDescription = meta.story({
  args: (() => {
    const role = roleFor("roleWithParsedJobDescription")
    if (role.jobDescriptionAnalysis) {
      role.jobDescriptionAnalysis.qualificationRequirements = {
        ...role.jobDescriptionAnalysis.qualificationRequirements,
        graduationCohorts: ["2027 届"],
        experience: ["有三个月以上前端实习经验"],
      }
      role.jobDescriptionAnalysis.requiredSkills.platforms = ["云原生平台"]
    }
    return { onEditAnalysisModule: fn(), role }
  })(),
})

export const CampusJobDescription = meta.story({
  args: (() => {
    const role = roleFor("roleWithParsedJobDescription")
    if (role.jobDescriptionAnalysis) {
      role.jobDescriptionAnalysis.qualificationRequirements = {
        ...role.jobDescriptionAnalysis.qualificationRequirements,
        graduationCohorts: ["2027 届"],
        experience: ["有 AI Agent 或 LLM 项目经验"],
      }
      role.jobDescriptionAnalysis.preferredQualifications = ["有开源项目贡献", "有相关竞赛经历"]
    }
    return { onEditAnalysisModule: fn(), role }
  })(),
})

export const SocialRecruitmentJobDescription = meta.story({
  args: {
    onEditAnalysisModule: fn(),
    role: roleFor("roleWithParsedJobDescription"),
  },
})

export const EmptyOptionalModules = meta.story({
  args: (() => {
    const role = roleFor("roleWithParsedJobDescription")
    if (role.jobDescriptionAnalysis) {
      role.jobDescriptionAnalysis.preferredQualifications = []
      role.jobDescriptionAnalysis.softSkills = []
      role.jobDescriptionAnalysis.businessDomains = []
    }
    return { onEditAnalysisModule: fn(), role }
  })(),
})
