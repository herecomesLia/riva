import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createRolesMockResponse } from "@/mocks/data/roles"
import type { RolesPageResponse } from "@/models/roles"
import { renderWithProviders } from "@/test/render"

import { RolesView } from "./RolesView"

function renderReadyView(
  data: RolesPageResponse,
  options: {
    initialSelectedRoleId?: string
    setCurrentTargetRole?: (roleId: string) => void
  } = {},
) {
  return renderWithProviders(
    <RolesView
      actions={{ setCurrentTargetRole: options.setCurrentTargetRole }}
      content={{ status: "ready", data }}
      initialSelectedRoleId={options.initialSelectedRoleId}
      variant="default"
    />,
    { router: { initialEntries: ["/roles"] } },
  )
}

describe("RolesView", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("keeps the page header and main card titles visible while loading", async () => {
    renderWithProviders(<RolesView content={{ status: "loading" }} variant="default" />, {
      router: { initialEntries: ["/roles"] },
    })

    expect(await screen.findByRole("heading", { name: i18n.t("roles.title") })).toBeInTheDocument()
    expect(screen.getByText(i18n.t("roles.description"))).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: i18n.t("roles.list.title") })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: i18n.t("roles.details.title") })).toBeInTheDocument()
    expect(screen.getByTestId("roles-loading-state")).toHaveAttribute("aria-busy", "true")
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(10)
  })

  it("renders the no-roles empty state", async () => {
    renderReadyView(createRolesMockResponse("noRoles"))

    expect(await screen.findByTestId("roles-empty-state")).toHaveTextContent(
      i18n.t("roles.empty.title"),
    )
    expect(screen.queryByTestId("roles-list-card")).not.toBeInTheDocument()
  })

  it("renders multiple saved roles and their preparation states", async () => {
    const data = createRolesMockResponse("multipleRoles")
    renderReadyView(data)

    const roleList = await screen.findByRole("list", { name: i18n.t("roles.list.title") })
    expect(within(roleList).getAllByRole("listitem")).toHaveLength(2)
    expect(within(roleList).getByText(data.roles[0]!.title)).toBeInTheDocument()
    expect(within(roleList).getByText(data.roles[1]!.title)).toBeInTheDocument()
    expect(
      within(roleList).getByText(i18n.t("roles.preparationStatus.preparing")),
    ).toBeInTheDocument()
    expect(within(roleList).getByText(i18n.t("roles.preparationStatus.paused"))).toBeInTheDocument()
  })

  it("keeps selected role separate from the server current role", async () => {
    const data = createRolesMockResponse("multipleRoles")
    const currentRole = data.roles.find((role) => role.isCurrent)!
    const selectedRole = data.roles.find((role) => !role.isCurrent)!
    renderReadyView(data, { initialSelectedRoleId: selectedRole.id })

    const currentButton = await screen.findByRole("button", {
      name: new RegExp(`^${currentRole.title}`),
    })
    const selectedButton = await screen.findByRole("button", {
      name: new RegExp(`^${selectedRole.title}`),
    })
    const details = screen.getByTestId("role-details-card")

    expect(currentButton).toHaveAttribute("aria-pressed", "false")
    expect(within(currentButton).getByText(i18n.t("roles.badges.current"))).toBeInTheDocument()
    expect(selectedButton).toHaveAttribute("aria-pressed", "true")
    expect(within(details).getByRole("heading", { name: selectedRole.title })).toBeInTheDocument()
    expect(within(details).queryByText(i18n.t("roles.badges.current"))).not.toBeInTheDocument()
  })

  it("renders an archived role when it is locally selected", async () => {
    const data = createRolesMockResponse("archivedRoles")
    const archivedRole = data.roles.find((role) => role.preparationStatus === "archived")!
    renderReadyView(data, { initialSelectedRoleId: archivedRole.id })

    const archivedButton = await screen.findByRole("button", {
      name: new RegExp(`^${archivedRole.title}`),
    })
    const details = screen.getByTestId("role-details-card")

    expect(archivedButton).toHaveAttribute("aria-pressed", "true")
    expect(within(details).getByRole("heading", { name: archivedRole.title })).toBeInTheDocument()
    expect(
      within(details).getByText(i18n.t("roles.preparationStatus.archived")),
    ).toBeInTheDocument()
  })

  it("changes only local selection when a role is clicked", async () => {
    const user = userEvent.setup()
    const setCurrentTargetRole = vi.fn()
    const data = createRolesMockResponse("multipleRoles")
    const currentRole = data.roles.find((role) => role.isCurrent)!
    const otherRole = data.roles.find((role) => !role.isCurrent)!
    renderReadyView(data, { setCurrentTargetRole })

    const currentButton = await screen.findByRole("button", {
      name: new RegExp(`^${currentRole.title}`),
    })
    const otherButton = await screen.findByRole("button", {
      name: new RegExp(`^${otherRole.title}`),
    })
    expect(currentButton).toHaveAttribute("aria-pressed", "true")

    await user.click(otherButton)

    expect(otherButton).toHaveAttribute("aria-pressed", "true")
    expect(currentButton).toHaveAttribute("aria-pressed", "false")
    expect(setCurrentTargetRole).not.toHaveBeenCalled()
    expect(within(currentButton).getByText(i18n.t("roles.badges.current"))).toBeInTheDocument()
  })

  it("shows an explicit notice when no server current role exists", async () => {
    const data = createRolesMockResponse("multipleRoles")
    data.currentRoleId = null
    data.roles.forEach((role) => {
      role.isCurrent = false
    })

    renderReadyView(data)

    expect(await screen.findByTestId("roles-no-current-alert")).toHaveTextContent(
      i18n.t("roles.noCurrentRole"),
    )
    expect(screen.getByRole("button", { name: new RegExp(data.roles[0]!.title) })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })
})
