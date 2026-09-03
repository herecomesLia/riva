import { useState } from "react"

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
  args: { role: roleFor("singleRoleWithoutJobDescription"), synchronizationError: false },
})

export const Parsing = meta.story({
  args: { role: roleFor("roleWithJobDescriptionParsing"), synchronizationError: false },
})

export const SynchronizationError = meta.story({
  args: {
    onRetrySynchronization: fn(),
    role: roleFor("roleWithJobDescriptionParsing"),
    synchronizationError: true,
  },
})

function SynchronizationRetryHarness() {
  const parsing = createRoleStoryResponse("roleWithJobDescriptionParsing")
  const ready = createRoleStoryResponse("roleWithParsedJobDescription")
  const [role, setRole] = useState<TargetRole>(parsing.roles[0]!)
  const [synchronizationError, setSynchronizationError] = useState(true)
  return (
    <JobDescriptionCard
      onRetrySynchronization={() => {
        setSynchronizationError(false)
        setRole(ready.roles[0]!)
      }}
      role={role}
      synchronizationError={synchronizationError}
    />
  )
}

export const SynchronizationRetry = meta.story({
  render: () => <SynchronizationRetryHarness />,
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /重新同步状态|synchronize status/i }))
    await expect(screen.getByTestId("job-description-analysis")).toBeVisible()
  },
})

export const Failed = meta.story({
  args: {
    onEdit: fn(),
    role: roleFor("roleWithJobDescriptionFailed"),
    synchronizationError: false,
  },
})

export const Ready = meta.story({
  args: {
    onEdit: fn(),
    role: roleFor("roleWithParsedJobDescription"),
    synchronizationError: false,
  },
})

const onEditAnalysisModule = fn()

export const EditAnalysisModule = meta.story({
  args: {
    onEdit: fn(),
    onEditAnalysisModule,
    role: roleFor("roleWithParsedJobDescription"),
    synchronizationError: false,
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
    synchronizationError: false,
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
    return { onEditAnalysisModule: fn(), role, synchronizationError: false }
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
    return { onEditAnalysisModule: fn(), role, synchronizationError: false }
  })(),
})

export const SocialRecruitmentJobDescription = meta.story({
  args: {
    onEditAnalysisModule: fn(),
    role: roleFor("roleWithParsedJobDescription"),
    synchronizationError: false,
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
    return { onEditAnalysisModule: fn(), role, synchronizationError: false }
  })(),
})
