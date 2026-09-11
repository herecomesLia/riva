import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen } from "storybook/test"

import type { RoleView } from "@/models/target-role-workflow"

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
  args: {
    onEdit: fn(),
    onEditAnalysisModule: fn(),
    role: roleFor("singleRoleWithoutJobDescription"),
    synchronizationError: false,
  },
})

export const Extracting = meta.story({
  args: {
    onAbortExtraction: fn(),
    role: roleFor("roleWithJobDescriptionExtracting"),
    synchronizationError: false,
  },
})

export const Aborting = meta.story({
  args: {
    onAbortExtraction: fn(),
    role: {
      ...roleFor("roleWithJobDescriptionExtracting"),
      jdState: { status: "extracting", phase: "aborting" },
    },
    synchronizationError: false,
  },
})

export const SynchronizationError = meta.story({
  args: {
    onRetrySynchronization: fn(),
    role: roleFor("roleWithJobDescriptionExtracting"),
    synchronizationError: true,
  },
})

function SynchronizationRetryHarness() {
  const extracting = createRoleStoryResponse("roleWithJobDescriptionExtracting")
  const ready = createRoleStoryResponse("roleWithExtractedJobDescription")
  const [role, setRole] = useState<RoleView>(extracting.roles[0]!)
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
    onRetryExtraction: fn(),
    onEdit: fn(),
    role: roleFor("roleWithJobDescriptionFailed"),
    synchronizationError: false,
  },
})

export const Ready = meta.story({
  args: {
    onEdit: fn(),
    role: roleFor("roleWithExtractedJobDescription"),
    synchronizationError: false,
  },
})

const onEditAnalysisModule = fn()

export const EditAnalysisModule = meta.story({
  args: {
    onEdit: fn(),
    onEditAnalysisModule,
    role: roleFor("roleWithExtractedJobDescription"),
    synchronizationError: false,
  },
  play: async ({ userEvent }) => {
    await userEvent.click(
      screen.getByRole("button", { name: /编辑 任职资格|edit qualifications/i }),
    )
    await expect(onEditAnalysisModule).toHaveBeenCalledWith("requirements")
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
    const role = roleFor("roleWithExtractedJobDescription")
    if (role.jd) {
      role.jd.requirements = {
        ...role.jd.requirements,
        graduationCohorts: ["2027 届"],
        experience: ["有三个月以上前端实习经验"],
      }
      role.jd.hardSkills.platforms = ["云原生平台"]
    }
    return { onEditAnalysisModule: fn(), role, synchronizationError: false }
  })(),
})

export const CampusJobDescription = meta.story({
  args: (() => {
    const role = roleFor("roleWithExtractedJobDescription")
    if (role.jd) {
      role.jd.requirements = {
        ...role.jd.requirements,
        graduationCohorts: ["2027 届"],
        experience: ["有 AI Agent 或 LLM 项目经验"],
      }
      role.jd.preferredQualifications = ["有开源项目贡献", "有相关竞赛经历"]
    }
    return { onEditAnalysisModule: fn(), role, synchronizationError: false }
  })(),
})

export const SocialRecruitmentJobDescription = meta.story({
  args: {
    onEditAnalysisModule: fn(),
    role: roleFor("roleWithExtractedJobDescription"),
    synchronizationError: false,
  },
})

export const EmptyOptionalModules = meta.story({
  args: (() => {
    const role = roleFor("roleWithExtractedJobDescription")
    if (role.jd) {
      role.jd.preferredQualifications = []
      role.jd.softSkills = []
      role.jd.businessDomains = []
    }
    return { onEditAnalysisModule: fn(), role, synchronizationError: false }
  })(),
})
