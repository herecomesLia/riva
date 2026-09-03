import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { dashboardResponseMock } from "@/mocks/data/dashboard"
import type { DashboardResponse } from "@/models/dashboard"
import { renderWithProviders } from "@/test/render"

import { CurrentRoleCard } from "./CurrentRoleCard"

type CurrentRole = NonNullable<DashboardResponse["currentRole"]>

function createRole(overrides: Partial<CurrentRole>): CurrentRole {
  return {
    ...dashboardResponseMock.currentRole!,
    ...overrides,
  }
}

function renderRole(currentRole: DashboardResponse["currentRole"]) {
  return renderWithProviders(<CurrentRoleCard state={{ data: currentRole, status: "ready" }} />, {
    router: { initialEntries: ["/dashboard"] },
  })
}

describe("CurrentRoleCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("shows both complete statuses without an add-job-description action", async () => {
    renderRole(createRole({ jobDescriptionAdded: true, profileCompleted: true }))

    expect(await screen.findByText("档案已完善")).toBeInTheDocument()
    expect(screen.getByText("JD 已添加")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "添加岗位 JD" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "完善求职档案" })).not.toBeInTheDocument()
  })

  it("prioritizes the profile action when only the profile is incomplete", async () => {
    renderRole(createRole({ jobDescriptionAdded: true, profileCompleted: false }))

    expect(await screen.findByText("待完善档案")).toBeInTheDocument()
    expect(screen.getByText("JD 已添加")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "完善求职档案" })).toHaveAttribute("href", "/profile")
    expect(screen.queryByRole("button", { name: "添加岗位 JD" })).not.toBeInTheDocument()
  })

  it("shows the job-description action when only the job description is missing", async () => {
    renderRole(createRole({ jobDescriptionAdded: false, profileCompleted: true }))

    expect(await screen.findByText("档案已完善")).toBeInTheDocument()
    expect(screen.getByText("待添加 JD")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "添加岗位 JD" })).toHaveAttribute("href", "/roles")
    expect(screen.queryByRole("button", { name: "完善求职档案" })).not.toBeInTheDocument()
  })

  it("shows only the profile action when both are incomplete", async () => {
    renderRole(createRole({ jobDescriptionAdded: false, profileCompleted: false }))

    expect(await screen.findByText("待完善档案")).toBeInTheDocument()
    expect(screen.getByText("待添加 JD")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "完善求职档案" })).toHaveAttribute("href", "/profile")
    expect(screen.queryByRole("button", { name: "添加岗位 JD" })).not.toBeInTheDocument()
  })

  it("renders the loading state", async () => {
    const { container } = renderWithProviders(<CurrentRoleCard state={{ status: "loading" }} />)

    expect(await screen.findByText("当前目标")).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(7)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("renders the empty state with the existing roles route", async () => {
    renderRole(null)

    expect(await screen.findByText("尚未设置目标岗位")).toBeInTheDocument()
    expect(screen.getByText("添加岗位信息后可获得匹配分析和个性化训练建议。")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "添加目标岗位" })).toHaveAttribute("href", "/roles")
  })
})
