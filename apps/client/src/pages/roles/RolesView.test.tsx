import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import type { TargetRoleResponse } from "@/api/generated/models"
import { createRoleStoryResponse } from "./stories/role-story-fixtures"
import type { RecognizeRoleInput } from "@/mocks/models/role"
import type { RoleStoryData } from "./stories/role-story-fixtures"
import { renderWithProviders } from "@/test/render"

import { RolesView, type RolesViewActions } from "./RolesView"
import type { TargetRoleTab } from "./components/RoleDetails"

function createActions(
  data: RoleStoryData,
  overrides: Partial<RolesViewActions> = {},
): RolesViewActions {
  return {
    archiveRole: vi.fn(async () => data),
    createRole: vi.fn(
      async () => createRoleStoryResponse("singleRoleWithoutJobDescription").targetRoles[0]!,
    ),
    deleteRole: vi.fn(async () => data),
    match: vi.fn(async () => data),
    retryJdSynchronization: vi.fn(async () => data),
    retryJdExtraction: vi.fn(async () => data),
    abortJdExtraction: vi.fn(async () => data),
    retryMatchSynchronization: vi.fn(async () => data),
    recognizeRole: vi.fn(
      async (_input: RecognizeRoleInput) =>
        data.targetRoles[0] ??
        createRoleStoryResponse("roleWithExtractedJobDescription").targetRoles[0]!,
    ),
    restoreRole: vi.fn(async () => data),
    extractJd: vi.fn(async () => data),
    setActiveRole: vi.fn(async () => data),
    updateJd: vi.fn(async () => data),
    updateRole: vi.fn(async () => data),
    ...overrides,
  }
}

function renderReadyView(
  data: RoleStoryData,
  options: {
    actions?: RolesViewActions
    initialActiveTab?: TargetRoleTab
    initialSelectedRoleId?: string
    jdSynchronizationErrorRoleIds?: string[]
    matchSynchronizationErrorRoleIds?: string[]
  } = {},
) {
  return renderWithProviders(
    <RolesView
      actions={options.actions ?? createActions(data)}
      content={{ status: "ready", data: data }}
      jdTasksByRoleId={data.jdTasksByRoleId}
      matchingByRoleId={data.matchingByRoleId}
      initialActiveTab={options.initialActiveTab}
      initialSelectedRoleId={options.initialSelectedRoleId}
      jdSynchronizationErrorRoleIds={options.jdSynchronizationErrorRoleIds}
      matchSynchronizationErrorRoleIds={options.matchSynchronizationErrorRoleIds}
      variant="default"
    />,
    { router: { initialEntries: ["/roles"] } },
  )
}

function expectFixedJobDescriptionEditorLayout(dialog: HTMLElement, scrollAreaTestId: string) {
  expect(dialog).toHaveClass("gap-0", "overflow-hidden", "p-0")
  expect(dialog.querySelector('[data-slot="dialog-header"]')).toHaveClass(
    "border-b",
    "px-6",
    "py-5",
    "pr-14",
  )
  expect(within(dialog).getByRole("heading")).toHaveClass("text-xl", "font-medium", "leading-tight")
  expect(within(dialog).getByTestId(scrollAreaTestId)).toHaveClass(
    "min-h-0",
    "overflow-y-auto",
    "px-6",
    "py-5",
  )
  expect(dialog.querySelector('[data-slot="dialog-footer"]')).toHaveClass(
    "border-t",
    "bg-popover",
    "px-6",
    "py-4",
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
    renderReadyView(createRoleStoryResponse("noRoles"))

    expect(await screen.findByTestId("roles-empty-state")).toHaveTextContent(
      i18n.t("roles.empty.title"),
    )
    expect(screen.queryByTestId("roles-list-card")).not.toBeInTheDocument()
  })

  it("renders multiple active roles", async () => {
    const data = createRoleStoryResponse("multipleRoles")
    renderReadyView(data)

    const roleList = await screen.findByRole("list", { name: i18n.t("roles.list.title") })
    expect(within(roleList).getAllByRole("listitem")).toHaveLength(2)
    expect(within(roleList).getByText(data.targetRoles[0]!.title)).toBeInTheDocument()
    expect(within(roleList).getByText(data.targetRoles[1]!.title)).toBeInTheDocument()
    expect(within(roleList).getAllByText(i18n.t("roles.status.active"))).toHaveLength(2)
  })

  it("shows My roles with active and archived categories, filtering the visible list locally", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("archivedRoles")
    const activeRole = data.targetRoles.find((role) => !role.isArchived)!
    const archivedRole = data.targetRoles.find((role) => role.isArchived)!
    renderReadyView(data)

    const desktopNavigation = await screen.findByTestId("roles-desktop-navigation")
    expect(
      await screen.findByRole("heading", { name: i18n.t("roles.list.title") }),
    ).toBeInTheDocument()
    expect(desktopNavigation).not.toHaveTextContent(i18n.t("roles.list.description"))
    expect(
      within(desktopNavigation).getByRole("tab", {
        name: i18n.t("roles.list.categories.active", { count: 1 }),
      }),
    ).toHaveAttribute("aria-selected", "true")
    const activeList = within(desktopNavigation).getByRole("list", {
      name: i18n.t("roles.list.title"),
    })
    expect(within(activeList).getByText(activeRole.title)).toBeInTheDocument()
    expect(within(activeList).queryByText(archivedRole.title)).not.toBeInTheDocument()

    await user.click(
      within(desktopNavigation).getByRole("tab", {
        name: i18n.t("roles.list.categories.archived", { count: 1 }),
      }),
    )

    const archivedList = within(desktopNavigation).getByRole("list", {
      name: i18n.t("roles.list.title"),
    })
    expect(within(archivedList).getByText(archivedRole.title)).toBeInTheDocument()
    expect(within(archivedList).queryByText(activeRole.title)).not.toBeInTheDocument()
    expect(screen.getByTestId("role-details-card")).toHaveTextContent(archivedRole.title)
  })

  it("shows match-score rings only for current or stale analyses and greys archived score indicators", async () => {
    const data = createRoleStoryResponse("archivedRoles")
    const currentRole = data.targetRoles.find((role) => role.id === data.activeTargetRoleId)!
    const archivedRole = data.targetRoles.find((role) => role.isArchived)!
    data.matchingByRoleId[archivedRole.id] = structuredClone(data.matchingByRoleId[currentRole.id])
    renderReadyView(data, { initialSelectedRoleId: archivedRole.id })

    const archivedButton = await screen.findByRole("button", {
      name: new RegExp(`^${archivedRole.title}`),
    })
    const scoreRing = within(archivedButton).getByTestId("role-match-score-ring")
    const statusBadges = within(archivedButton).getByTestId("role-status-badges")

    expect(scoreRing).toHaveTextContent("78%")
    expect(scoreRing).toHaveAttribute("data-role-status", "archived")
    expect(within(statusBadges).getByText(i18n.t("roles.status.archived"))).toHaveAttribute(
      "data-role-status",
      "archived",
    )
  })

  it("keeps the navigation available when the chosen category is empty", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("multipleRoles")
    renderReadyView(data)

    const desktopNavigation = await screen.findByTestId("roles-desktop-navigation")
    await user.click(
      within(desktopNavigation).getByRole("tab", {
        name: i18n.t("roles.list.categories.archived", { count: 0 }),
      }),
    )

    expect(
      within(desktopNavigation).getByText(i18n.t("roles.list.empty.archived")),
    ).toBeInTheDocument()
    expect(screen.getByTestId("roles-desktop-navigation")).toBeInTheDocument()
    expect(screen.queryByTestId("role-details-card")).not.toBeInTheDocument()

    await user.click(
      within(desktopNavigation).getByRole("tab", {
        name: i18n.t("roles.list.categories.active", { count: 2 }),
      }),
    )
    expect(screen.getByTestId("role-details-card")).toBeInTheDocument()
  })

  it("does not reserve a match-score ring for roles without an eligible analysis", async () => {
    const data = createRoleStoryResponse("multipleRoles")
    const roleWithoutAnalysis = data.targetRoles.find(
      (role) => data.matchingByRoleId[role.id]?.status === "blocked",
    )!
    renderReadyView(data)

    const button = await screen.findByRole("button", {
      name: new RegExp(`^${roleWithoutAnalysis.title}`),
    })
    expect(within(button).queryByTestId("role-match-score-ring")).not.toBeInTheDocument()
  })

  it("keeps selected role separate from the server current role", async () => {
    const data = createRoleStoryResponse("multipleRoles")
    const currentRole = data.targetRoles.find((role) => role.id === data.activeTargetRoleId)!
    const selectedRole = data.targetRoles.find((role) => role.id !== data.activeTargetRoleId)!
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
    const data = createRoleStoryResponse("archivedRoles")
    const archivedRole = data.targetRoles.find((role) => role.isArchived)!
    renderReadyView(data, { initialSelectedRoleId: archivedRole.id })

    const archivedButton = await screen.findByRole("button", {
      name: new RegExp(`^${archivedRole.title}`),
    })
    const details = screen.getByTestId("role-details-card")

    expect(archivedButton).toHaveAttribute("aria-pressed", "true")
    expect(within(details).getByRole("heading", { name: archivedRole.title })).toBeInTheDocument()
    expect(within(details).getByText(i18n.t("roles.status.archived"))).toBeInTheDocument()
  })

  it("restores an archived role", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("archivedRoles")
    const archivedRole = data.targetRoles.find((role) => role.isArchived)!
    const restoreRole = vi.fn(async () => data)
    const actions = createActions(data, { restoreRole })
    renderReadyView(data, { actions, initialSelectedRoleId: archivedRole.id })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.restore") }))

    expect(restoreRole).toHaveBeenCalledWith(archivedRole.id)
    expect(actions.setActiveRole).not.toHaveBeenCalled()
  })

  it("changes only local selection when a role is clicked", async () => {
    const user = userEvent.setup()
    const setActiveRole = vi.fn(async () => data)
    const data = createRoleStoryResponse("multipleRoles")
    const currentRole = data.targetRoles.find((role) => role.id === data.activeTargetRoleId)!
    const otherRole = data.targetRoles.find((role) => role.id !== data.activeTargetRoleId)!
    renderReadyView(data, { actions: createActions(data, { setActiveRole }) })

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
    expect(setActiveRole).not.toHaveBeenCalled()
    expect(within(currentButton).getByText(i18n.t("roles.badges.current"))).toBeInTheDocument()
  })

  it("defaults to overview and keeps inactive tab content out of the document", async () => {
    const data = createRoleStoryResponse("roleWithExtractedJobDescription")
    renderReadyView(data)

    expect(await screen.findByTestId("target-role-overview")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: i18n.t("roles.tabs.overview") })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    expect(screen.queryByTestId("job-description-card")).not.toBeInTheDocument()
    expect(screen.queryByTestId("matching-analysis-card")).not.toBeInTheDocument()
  })

  it("switches between JD and matching-analysis tabs", async () => {
    const user = userEvent.setup()
    renderReadyView(createRoleStoryResponse("matchingAnalysisCurrent"))

    await user.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.jobDescription") }))
    expect(screen.getByTestId("job-description-card")).toBeInTheDocument()
    expect(screen.queryByTestId("target-role-overview")).not.toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: i18n.t("roles.tabs.matchingAnalysis") }))
    expect(screen.getByTestId("matching-analysis-card")).toBeInTheDocument()
    expect(screen.queryByTestId("job-description-card")).not.toBeInTheDocument()
  })

  it("keeps the tab strip horizontally scrollable while explicitly hiding vertical overflow", async () => {
    renderReadyView(createRoleStoryResponse("matchingAnalysisCurrent"))

    expect(await screen.findByTestId("target-role-tabs-scroll")).toHaveClass(
      "overflow-x-auto",
      "overflow-y-hidden",
      "pb-1",
    )
    expect(within(screen.getByTestId("target-role-tabs-scroll")).getAllByRole("tab")).toHaveLength(
      3,
    )
  })

  it("preserves the active tab and updates the progress summary when selection changes", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("multipleRoles")
    const currentRole = data.targetRoles.find((role) => role.id === data.activeTargetRoleId)!
    const otherRole = data.targetRoles.find((role) => role.id !== data.activeTargetRoleId)!
    renderReadyView(data)

    await user.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.jobDescription") }))
    await user.click(screen.getByRole("button", { name: new RegExp(`^${otherRole.title}`) }))

    expect(screen.getByRole("tab", { name: i18n.t("roles.tabs.jobDescription") })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    expect(screen.getByTestId("job-description-card")).toHaveTextContent(
      i18n.t("roles.details.sections.jobDescription"),
    )
    const desktopSummary = within(screen.getByTestId("roles-desktop-navigation")).getByTestId(
      "target-role-progress-summary",
    )
    expect(desktopSummary).toHaveTextContent(otherRole.title)
    expect(desktopSummary).not.toHaveTextContent(i18n.t("roles.badges.current"))
    expect(
      within(screen.getByRole("button", { name: new RegExp(`^${currentRole.title}`) })).getByText(
        i18n.t("roles.badges.current"),
      ),
    ).toBeInTheDocument()
  })

  it("keeps the progress summary textual without status badges or a match score", async () => {
    const data = createRoleStoryResponse("matchingAnalysisCurrent")
    renderReadyView(data)

    const summary = within(await screen.findByTestId("roles-desktop-navigation")).getByTestId(
      "target-role-progress-summary",
    )
    expect(within(summary).queryByTestId("role-status-badges")).not.toBeInTheDocument()
    expect(summary).not.toHaveTextContent("78%")
    expect(summary).not.toHaveTextContent(i18n.t("roles.summary.profile"))
    expect(summary).toHaveTextContent(i18n.t("roles.summary.roleStatus"))
    expect(summary).toHaveTextContent(i18n.t("roles.summary.updatedAt"))
  })

  it("uses the mobile selector without changing the server current role", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("multipleRoles")
    const currentRole = data.targetRoles.find((role) => role.id === data.activeTargetRoleId)!
    const otherRole = data.targetRoles.find((role) => role.id !== data.activeTargetRoleId)!
    const setActiveRole = vi.fn(async () => data)
    renderReadyView(data, { actions: createActions(data, { setActiveRole }) })

    await user.click(await screen.findByTestId("mobile-role-selector-trigger"))
    await user.click(await screen.findByRole("option", { name: new RegExp(otherRole.title) }))

    expect(screen.getByTestId("role-details-card")).toHaveTextContent(otherRole.title)
    expect(setActiveRole).not.toHaveBeenCalled()
    expect(
      within(screen.getByRole("button", { name: new RegExp(`^${currentRole.title}`) })).getByText(
        i18n.t("roles.badges.current"),
      ),
    ).toBeInTheDocument()
  })

  it("keeps active and archived categories available in the mobile selector", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("archivedRoles")
    const archivedRole = data.targetRoles.find((role) => role.isArchived)!
    const setActiveRole = vi.fn(async () => data)
    renderReadyView(data, { actions: createActions(data, { setActiveRole }) })

    const mobileSelector = await screen.findByTestId("mobile-role-selector")
    await user.click(
      within(mobileSelector).getByRole("tab", {
        name: i18n.t("roles.list.categories.archived", { count: 1 }),
      }),
    )

    expect(screen.getByTestId("role-details-card")).toHaveTextContent(archivedRole.title)
    expect(setActiveRole).not.toHaveBeenCalled()
  })

  it("falls back to the current role after a selected role disappears and preserves the tab", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("multipleRoles")
    const currentRole = data.targetRoles.find((role) => role.id === data.activeTargetRoleId)!
    const selectedRole = data.targetRoles.find((role) => role.id !== data.activeTargetRoleId)!
    const actions = createActions(data)
    const view = renderReadyView(data, {
      actions,
      initialSelectedRoleId: selectedRole.id,
    })
    await user.click(
      await screen.findByRole("tab", { name: i18n.t("roles.tabs.matchingAnalysis") }),
    )

    const nextData = structuredClone(data)
    nextData.targetRoles = nextData.targetRoles.filter((role) => role.id !== selectedRole.id)
    view.rerender(
      <RolesView
        actions={actions}
        content={{ status: "ready", data: nextData }}
        jdTasksByRoleId={nextData.jdTasksByRoleId}
        matchingByRoleId={nextData.matchingByRoleId}
        variant="default"
      />,
    )

    expect(screen.getByTestId("role-details-card")).toHaveTextContent(currentRole.title)
    expect(
      screen.getByRole("tab", { name: i18n.t("roles.tabs.matchingAnalysis") }),
    ).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("matching-analysis-card")).toBeInTheDocument()
  })

  it("exposes the sticky navigation and its internally scrollable role list", async () => {
    renderReadyView(createRoleStoryResponse("multipleRoles"))

    expect(await screen.findByTestId("roles-desktop-navigation")).toBeInTheDocument()
    expect(screen.getByTestId("roles-list-scroll")).toHaveClass(
      "overflow-x-hidden",
      "overflow-y-auto",
      "[scrollbar-gutter:stable]",
      "[scrollbar-width:thin]",
      "pr-2.5",
    )
  })

  it("uses a stable one-pixel role-card border and a non-shrinking match-score ring", async () => {
    const data = createRoleStoryResponse("multipleRoles")
    const currentRole = data.targetRoles.find((role) => role.id === data.activeTargetRoleId)!
    const otherRole = data.targetRoles.find((role) => role.id !== data.activeTargetRoleId)!
    renderReadyView(data)

    const roleButton = await screen.findByRole("button", {
      name: new RegExp(`^${currentRole.title}`),
    })
    expect(roleButton).toHaveClass("border", "focus-visible:border-primary", "focus-visible:ring-1")
    expect(roleButton).not.toHaveClass("active:not-aria-[haspopup]:translate-y-px")
    expect(roleButton).toHaveClass("px-2.5", "py-2.5")
    expect(screen.getByRole("button", { name: new RegExp(`^${otherRole.title}`) })).toHaveClass(
      "border",
      "hover:border-primary/60",
    )
    expect(within(roleButton).getByTestId("role-match-score-ring")).toHaveClass(
      "basis-11",
      "shrink-0",
    )
  })

  it("validates required role title", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("noRoles")
    const actions = createActions(data)
    renderReadyView(data, { actions })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    const methodDialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.title"),
    })
    await user.click(
      within(methodDialog).getByRole("button", {
        name: i18n.t("roles.creation.methods.manual"),
      }),
    )
    const dialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.methodTitles.manual"),
    })
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.editor.save") }))
    expect(
      await within(dialog).findByText(i18n.t("roles.editor.validation.required")),
    ).toBeInTheDocument()
    expect(actions.createRole).not.toHaveBeenCalled()
  })

  it("offers all four target-role creation methods with or without existing roles", async () => {
    const user = userEvent.setup()
    renderReadyView(createRoleStoryResponse("multipleRoles"))

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    let dialog = await screen.findByRole("dialog", { name: i18n.t("roles.creation.title") })

    expect(within(dialog).queryByRole("tab")).not.toBeInTheDocument()

    for (const method of ["manual", "text", "image", "url"] as const) {
      const methodButton = within(dialog).getByRole("button", {
        name: i18n.t(`roles.creation.methods.${method}`),
      })
      expect(methodButton).toHaveClass(
        "border-primary/20",
        "bg-primary/10",
        "has-data-[icon=inline-start]:pl-4",
      )
      expect(
        within(dialog).queryByText(i18n.t(`roles.creation.methodDescriptions.${method}`)),
      ).not.toBeInTheDocument()
      await user.click(methodButton)
      const entryDialog = await screen.findByRole("dialog", {
        name: i18n.t(`roles.creation.methodTitles.${method}`),
      })
      const returnButton = within(entryDialog).getByRole("button", {
        name: i18n.t("roles.creation.backToMethods"),
      })
      expect(returnButton.closest('[data-slot="dialog-footer"]')).toBeInTheDocument()
      expect(returnButton).toHaveClass(
        "text-muted-foreground",
        "hover:bg-transparent",
        "hover:text-primary",
        "active:bg-transparent",
        "active:text-primary",
      )
      await user.click(returnButton)
      dialog = await screen.findByRole("dialog", { name: i18n.t("roles.creation.title") })
    }
  })

  it("confirms before clearing a draft when returning to the entry methods", async () => {
    const user = userEvent.setup()
    renderReadyView(createRoleStoryResponse("noRoles"))

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    const methodDialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.title"),
    })
    await user.click(
      within(methodDialog).getByRole("button", {
        name: i18n.t("roles.creation.methods.manual"),
      }),
    )
    const entryDialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.methodTitles.manual"),
    })
    await user.type(
      within(entryDialog).getByLabelText(i18n.t("roles.editor.fields.title")),
      "Draft role",
    )
    await user.click(
      within(entryDialog).getByRole("button", { name: i18n.t("roles.creation.backToMethods") }),
    )

    const confirmation = await screen.findByRole("alertdialog", {
      name: i18n.t("roles.creation.changeMethod.title"),
    })
    await user.click(
      within(confirmation).getByRole("button", {
        name: i18n.t("roles.creation.changeMethod.stay"),
      }),
    )
    expect(within(entryDialog).getByDisplayValue("Draft role")).toBeInTheDocument()

    await user.click(
      within(entryDialog).getByRole("button", { name: i18n.t("roles.creation.backToMethods") }),
    )
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: i18n.t("roles.creation.changeMethod.confirm"),
      }),
    )
    expect(
      await screen.findByRole("dialog", { name: i18n.t("roles.creation.title") }),
    ).toBeInTheDocument()
  })

  it("recognizes pasted text and closes without retaining a review draft", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("noRoles")
    const actions = createActions(data)
    renderReadyView(data, { actions })
    const text = [
      "岗位名称：前端工程师",
      "公司：Riva",
      "工作地点：上海",
      "负责构建可访问的 React 产品界面。",
    ].join("\n")

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    const methodDialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.title"),
    })
    await user.click(
      within(methodDialog).getByRole("button", { name: i18n.t("roles.creation.methods.text") }),
    )
    const dialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.methodTitles.text"),
    })
    await user.type(within(dialog).getByLabelText(i18n.t("roles.creation.text.label")), text)
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.creation.recognize") }),
    )

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(actions.recognizeRole).toHaveBeenCalledWith({ sourceType: "text", text })
  })

  it("sends uploaded screenshots directly through the image Agent entry path", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("noRoles")
    const actions = createActions(data)
    renderReadyView(data, { actions })
    const image = new File(["job screenshot"], "job-posting.png", { type: "image/png" })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    const methodDialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.title"),
    })
    await user.click(
      within(methodDialog).getByRole("button", { name: i18n.t("roles.creation.methods.image") }),
    )
    const dialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.methodTitles.image"),
    })
    expect(within(dialog).getByText(/视觉 Agent/)).toBeInTheDocument()
    expect(within(dialog).getByText(/不使用 OCR/)).toBeInTheDocument()
    await user.upload(within(dialog).getByLabelText(i18n.t("roles.creation.image.label")), image)
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.creation.recognize") }),
    )

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(actions.recognizeRole).toHaveBeenCalledWith({
      sourceType: "image",
      images: [image],
    })
  })

  it("recognizes a public job link before creating a role", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("multipleRoles")
    const actions = createActions(data)
    renderReadyView(data, { actions })
    const url = "https://jobs.example.com/frontend-engineer"

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    const methodDialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.title"),
    })
    await user.click(
      within(methodDialog).getByRole("button", { name: i18n.t("roles.creation.methods.url") }),
    )
    const dialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.methodTitles.url"),
    })
    await user.type(within(dialog).getByLabelText(i18n.t("roles.creation.url.label")), url)
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.creation.recognize") }),
    )

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(actions.recognizeRole).toHaveBeenCalledWith({ sourceType: "url", url })
  })

  it("sets the selected active role as current", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("multipleRoles")
    const selectedRole = data.targetRoles.find((role) => role.id !== data.activeTargetRoleId)!
    const actions = createActions(data)
    renderReadyView(data, { actions, initialSelectedRoleId: selectedRole.id })

    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.actions.setCurrent") }),
    )
    expect(actions.setActiveRole).toHaveBeenCalledWith(selectedRole.id)
  })

  it("prevents duplicate form submissions while a save is pending", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("noRoles")
    let resolveSave!: (value: TargetRoleResponse) => void
    const pendingSave = new Promise<TargetRoleResponse>((resolve) => {
      resolveSave = resolve
    })
    const createRole = vi.fn(() => pendingSave)
    renderReadyView(data, { actions: createActions(data, { createRole }) })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    const methodDialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.title"),
    })
    await user.click(
      within(methodDialog).getByRole("button", {
        name: i18n.t("roles.creation.methods.manual"),
      }),
    )
    const dialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.methodTitles.manual"),
    })
    await user.type(
      within(dialog).getByLabelText(i18n.t("roles.editor.fields.title")),
      "Data Engineer",
    )
    const save = within(dialog).getByRole("button", { name: i18n.t("roles.editor.save") })
    await user.click(save)

    await waitFor(() => expect(createRole).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(save).toBeDisabled())
    resolveSave(createRoleStoryResponse("singleRoleWithoutJobDescription").targetRoles[0]!)
  })

  it("closes after a successful edit save", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("singleRoleWithoutJobDescription")
    const actions = createActions(data)
    renderReadyView(data, { actions })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    const title = within(dialog).getByLabelText(i18n.t("roles.editor.fields.title"))
    await user.clear(title)
    await user.type(title, "Staff Frontend Engineer")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.editor.save") }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(actions.updateRole).toHaveBeenCalledWith(
      data.targetRoles[0]!.id,
      expect.objectContaining({ title: "Staff Frontend Engineer" }),
    )
  })

  it("shows a safe request error and preserves a failed draft", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("singleRoleWithoutJobDescription")
    const updateRole = vi.fn(async () => {
      throw new Error("unsafe transport failure")
    })
    renderReadyView(data, { actions: createActions(data, { updateRole }) })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    const title = within(dialog).getByLabelText(i18n.t("roles.editor.fields.title"))
    await user.clear(title)
    await user.type(title, "Unsaved Staff Engineer")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.editor.save") }))

    expect(
      await within(dialog).findByText(i18n.t("roles.errors.requestFailed")),
    ).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("Unsaved Staff Engineer")).toBeInTheDocument()
    expect(within(dialog).queryByText("unsafe transport failure")).not.toBeInTheDocument()
  })

  it("requires destructive confirmation before deleting", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("singleRoleWithoutJobDescription")
    const actions = createActions(data)
    renderReadyView(data, { actions })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.delete") }))
    expect(actions.deleteRole).not.toHaveBeenCalled()
    const confirmation = await screen.findByRole("alertdialog")
    await user.click(
      within(confirmation).getByRole("button", { name: i18n.t("roles.actions.delete") }),
    )
    expect(actions.deleteRole).toHaveBeenCalledWith(data.targetRoles[0]!.id)
  })

  it("confirms before closing a dirty editor", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("noRoles")
    renderReadyView(data)

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    const methodDialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.title"),
    })
    await user.click(
      within(methodDialog).getByRole("button", {
        name: i18n.t("roles.creation.methods.manual"),
      }),
    )
    const dialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.methodTitles.manual"),
    })
    await user.type(within(dialog).getByLabelText(i18n.t("roles.editor.fields.title")), "Draft")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.editor.cancel") }))

    const discard = await screen.findByRole("alertdialog")
    expect(within(dialog).getByDisplayValue("Draft")).toBeInTheDocument()
    await user.click(
      within(discard).getByRole("button", { name: i18n.t("roles.dialog.stayEditing") }),
    )
    expect(within(dialog).getByDisplayValue("Draft")).toBeInTheDocument()
  })

  it("blocks page navigation while the editor is dirty", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("noRoles")
    const { router } = renderReadyView(data)

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    const methodDialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.title"),
    })
    await user.click(
      within(methodDialog).getByRole("button", {
        name: i18n.t("roles.creation.methods.manual"),
      }),
    )
    const dialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.creation.methodTitles.manual"),
    })
    await user.type(within(dialog).getByLabelText(i18n.t("roles.editor.fields.title")), "Draft")

    act(() => {
      void router!.navigate({ to: "/profile" })
    })

    const blocker = await screen.findByRole("alertdialog")
    expect(within(blocker).getByText(i18n.t("roles.dialog.leavePageTitle"))).toBeInTheDocument()
    expect(router!.state.location.pathname).toBe("/roles")
  })

  it("opens an empty paste form for a missing job description", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("singleRoleWithoutJobDescription")
    renderReadyView(data, { initialActiveTab: "job-description" })

    const card = await screen.findByTestId("job-description-card")
    expect(card).toHaveTextContent(i18n.t("roles.jd.cardDescription"))
    const sections = within(card).getByTestId("job-description-analysis")
    expect(within(sections).getAllByRole("heading")).toHaveLength(6)
    expect(within(sections).getAllByRole("button", { name: /^编辑 |^edit /i })).toHaveLength(6)
    expect(within(sections).queryByRole("listitem")).not.toBeInTheDocument()
    await user.click(within(card).getByRole("button", { name: i18n.t("roles.jd.actions.replace") }))
    const dialog = await screen.findByRole("dialog")
    expectFixedJobDescriptionEditorLayout(dialog, "job-description-editor-scroll")
    expect(within(dialog).getByLabelText(i18n.t("roles.jd.editor.fieldLabel"))).toHaveValue("")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.jd.editor.save") }))
    expect(await within(dialog).findByText(i18n.t("roles.jd.editor.required"))).toBeInTheDocument()
  })

  it.each(["queued", "running", "aborting"] as const)(
    "shows extraction phase %s without exposing results early",
    async (phase) => {
      const user = userEvent.setup()
      const data = createRoleStoryResponse("roleWithJobDescriptionExtracting")
      data.jdTasksByRoleId[data.targetRoles[0]!.id] = { status: phase, error: null }
      const actions = createActions(data)
      renderReadyView(data, { actions, initialActiveTab: "job-description" })

      const card = await screen.findByTestId("job-description-card")
      expect(card).toHaveTextContent(
        i18n.t(
          phase === "aborting"
            ? "roles.jd.aborting"
            : "roles.jobDescriptionStatus.extracting.description",
        ),
      )
      expect(screen.queryByTestId("job-description-analysis")).not.toBeInTheDocument()
      const cancel = within(card).getByRole("button", {
        name: i18n.t("roles.jd.actions.abortExtraction"),
      })
      if (phase === "aborting") expect(cancel).toBeDisabled()
      else {
        await user.click(cancel)
        expect(actions.abortJdExtraction).toHaveBeenCalledWith(data.targetRoles[0]!.id)
      }
    },
  )

  it("keeps a JD synchronization error accessible from the JD tab", async () => {
    const data = createRoleStoryResponse("roleWithJobDescriptionExtracting")
    const role = data.targetRoles[0]!
    renderReadyView(data, {
      initialActiveTab: "job-description",
      jdSynchronizationErrorRoleIds: [role.id],
    })

    const card = await screen.findByTestId("job-description-card")
    expect(card).toHaveTextContent(i18n.t("roles.jd.synchronization.title"))
    expect(
      within(card).getByRole("button", { name: i18n.t("roles.jd.actions.resynchronize") }),
    ).toBeEnabled()
  })

  it("shows the safe business failure and offers a new JD submission", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("roleWithJobDescriptionFailed")
    const role = data.targetRoles[0]!
    const task = data.jdTasksByRoleId[role.id]
    if (task?.status !== "failed") throw new Error("Expected a failed JD fixture.")
    const actions = createActions(data)
    renderReadyView(data, { actions, initialActiveTab: "job-description" })

    const card = await screen.findByTestId("job-description-card")
    expect(card).toHaveTextContent(task.error.message)
    expect(
      within(card).getByRole("button", { name: i18n.t("roles.jd.actions.replace") }),
    ).toBeEnabled()
    await user.click(
      within(card).getByRole("button", { name: i18n.t("roles.jd.actions.retryExtraction") }),
    )
    expect(actions.retryJdExtraction).toHaveBeenCalledWith(role.id)
  })

  it("opens an empty JD editor after an extraction failure", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("roleWithJobDescriptionFailed")
    renderReadyView(data, {
      actions: createActions(data),
      initialActiveTab: "job-description",
    })

    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.jd.actions.replace") }),
    )

    expect(
      within(await screen.findByRole("dialog")).getByLabelText(
        i18n.t("roles.jd.editor.fieldLabel"),
      ),
    ).toHaveValue("")
  })

  it("renders every structured section for a ready job description", async () => {
    const data = createRoleStoryResponse("roleWithExtractedJobDescription")
    const analysis = data.targetRoles[0]!.jd!
    renderReadyView(data, { initialActiveTab: "job-description" })

    const result = await screen.findByTestId("job-description-analysis")
    for (const key of [
      "responsibilities",
      "requiredSkills",
      "qualificationRequirements",
      "preferredQualifications",
      "softSkills",
      "businessDomains",
    ] as const) {
      expect(
        within(result).getByRole("heading", { name: i18n.t(`roles.jd.analysis.${key}`) }),
      ).toBeInTheDocument()
    }
    expect(within(result).getAllByRole("button", { name: /^编辑 |^edit /i })).toHaveLength(6)
    expect(result).not.toHaveTextContent("解析结果可按模块校正，修改后匹配分析需要重新生成。")
    expect(result).not.toHaveTextContent("高频关键词")
    expect(result).toHaveTextContent(analysis.responsibilities[0]!)
    expect(result).toHaveTextContent(analysis.hardSkills.programmingLanguages[0]!)
    for (const key of [
      "responsibilities",
      "qualificationRequirements",
      "requiredSkills",
      "preferredQualifications",
      "softSkills",
      "businessDomains",
    ] as const) {
      expect(
        within(
          within(result)
            .getByRole("heading", { name: i18n.t(`roles.jd.analysis.${key}`) })
            .closest("section")!,
        )
          .getByRole("heading")
          .querySelector("svg"),
      ).not.toBeNull()
    }
    const qualificationSection = within(result)
      .getByRole("heading", { name: i18n.t("roles.jd.analysis.qualificationRequirements") })
      .closest("section")!
    const requiredSkillsSection = within(result)
      .getByRole("heading", { name: i18n.t("roles.jd.analysis.requiredSkills") })
      .closest("section")!
    expect(qualificationSection.parentElement).toBe(requiredSkillsSection.parentElement)
  })

  it("fills an empty module without opening the JD source editor", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("singleRoleWithoutJobDescription")
    const updateJd = vi.fn(async () => data)
    renderReadyView(data, {
      actions: createActions(data, { updateJd }),
      initialActiveTab: "job-description",
    })

    const summaryTitle = i18n.t("roles.jd.analysis.preferredQualifications")
    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("roles.jd.actions.editModuleLabel", { module: summaryTitle }),
      }),
    )
    const dialog = await screen.findByRole("dialog")
    expectFixedJobDescriptionEditorLayout(dialog, "job-description-analysis-editor-scroll")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.jd.analysisEditor.addBullet") }),
    )
    const textarea = within(dialog).getByLabelText(`${summaryTitle} 1`)
    expect(textarea).toHaveValue("")
    expect(
      within(dialog).queryByLabelText(i18n.t("roles.jd.editor.fieldLabel")),
    ).not.toBeInTheDocument()

    await user.clear(textarea)
    await user.type(textarea, "Corrected structured qualification.")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.jd.actions.saveCorrection") }),
    )
    expect(updateJd).toHaveBeenCalledWith(data.targetRoles[0]!.id, {
      preferredQualifications: ["Corrected structured qualification."],
    })
  })

  it("keeps the bullet-paste editor header and footer fixed around its scrolling content", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("roleWithExtractedJobDescription")
    renderReadyView(data, { initialActiveTab: "job-description" })

    const moduleTitle = i18n.t("roles.jd.analysis.preferredQualifications")
    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("roles.jd.actions.editModuleLabel", { module: moduleTitle }),
      }),
    )
    const moduleDialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.jd.actions.editModuleLabel", { module: moduleTitle }),
    })
    await user.click(
      within(moduleDialog).getByRole("button", {
        name: i18n.t("roles.jd.analysisEditor.pasteAndOrganize"),
      }),
    )

    const pasteDialog = await screen.findByRole("dialog", {
      name: i18n.t("roles.jd.analysisEditor.pasteContent"),
    })
    expectFixedJobDescriptionEditorLayout(pasteDialog, "job-description-bullet-editor-scroll")
  })

  it("renders only non-empty qualification and skill categories, while keeping preferred items semantic lists", async () => {
    const data = createRoleStoryResponse("roleWithExtractedJobDescription")
    const analysis = data.targetRoles[0]!.jd!
    analysis.requirements = {
      education: ["本科及以上"],
      graduationCohorts: [],
      majors: ["计算机相关专业"],
      experience: [],
      languages: [],
      certifications: [],
    }
    analysis.hardSkills = {
      programmingLanguages: ["TypeScript"],
      frameworksAndLibraries: [],
      platforms: ["Kubernetes"],
      tools: [],
      conceptsAndMethods: [],
      databasesAndMiddleware: [],
      other: [],
    }
    renderReadyView(data, { initialActiveTab: "job-description" })

    const result = await screen.findByTestId("job-description-analysis")
    expect(result).toHaveTextContent(i18n.t("roles.jd.analysis.qualificationCategories.education"))
    expect(result).toHaveTextContent(i18n.t("roles.jd.analysis.skillCategories.platforms"))
    expect(result).not.toHaveTextContent(
      i18n.t("roles.jd.analysis.qualificationCategories.graduationCohorts"),
    )
    expect(result).not.toHaveTextContent(
      i18n.t("roles.jd.analysis.skillCategories.frameworksAndLibraries"),
    )
    const preferredSection = within(result)
      .getByRole("heading", { name: i18n.t("roles.jd.analysis.preferredQualifications") })
      .closest("section")!
    expect(within(preferredSection).getByRole("list")).toBeInTheDocument()
    expect(preferredSection.querySelector('[data-slot="badge"]')).toBeNull()
    const softSkillsSection = within(result)
      .getByRole("heading", { name: i18n.t("roles.jd.analysis.softSkills") })
      .closest("section")!
    expect(within(softSkillsSection).getByRole("list")).toBeInTheDocument()
    expect(softSkillsSection.querySelector('[data-slot="badge"]')).toBeNull()
  })

  it("prefills and submits all qualification categories together", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("roleWithExtractedJobDescription")
    const updateJd = vi.fn(async () => data)
    renderReadyView(data, {
      actions: createActions(data, { updateJd }),
      initialActiveTab: "job-description",
    })

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("roles.jd.actions.editModuleLabel", {
          module: i18n.t("roles.jd.analysis.qualificationRequirements"),
        }),
      }),
    )
    const dialog = await screen.findByRole("dialog")
    const education = within(dialog).getByLabelText(
      `${i18n.t("roles.jd.analysis.qualificationCategories.education")} 1`,
    )
    expect(education).toHaveValue("Bachelor's degree or above.")
    await user.click(
      within(dialog).getAllByRole("button", {
        name: i18n.t("roles.jd.analysisEditor.addBullet"),
      })[1]!,
    )
    const graduationCohorts = within(dialog).getByLabelText(
      `${i18n.t("roles.jd.analysis.qualificationCategories.graduationCohorts")} 1`,
    )
    await user.type(graduationCohorts, "2027 届")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.jd.actions.saveCorrection") }),
    )
    expect(updateJd).toHaveBeenCalledWith(
      data.targetRoles[0]!.id,
      expect.objectContaining({
        requirements: expect.objectContaining({ graduationCohorts: ["2027 届"] }),
      }),
    )
  })

  it("prefills and submits all required-skill categories together", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("roleWithExtractedJobDescription")
    const updateJd = vi.fn(async () => data)
    renderReadyView(data, {
      actions: createActions(data, { updateJd }),
      initialActiveTab: "job-description",
    })

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("roles.jd.actions.editModuleLabel", {
          module: i18n.t("roles.jd.analysis.requiredSkills"),
        }),
      }),
    )
    const dialog = await screen.findByRole("dialog")
    const programmingLanguages = within(dialog).getByLabelText(
      `${i18n.t("roles.jd.analysis.skillCategories.programmingLanguages")} 1`,
    )
    expect(programmingLanguages).toHaveValue("TypeScript")
    await user.click(
      within(dialog).getAllByRole("button", {
        name: i18n.t("roles.jd.analysisEditor.addBullet"),
      })[3]!,
    )
    const tools = within(dialog).getByLabelText(
      `${i18n.t("roles.jd.analysis.skillCategories.tools")} 2`,
    )
    await user.type(tools, "Docker")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.jd.actions.saveCorrection") }),
    )
    expect(updateJd).toHaveBeenCalledWith(
      data.targetRoles[0]!.id,
      expect.objectContaining({
        hardSkills: expect.objectContaining({ tools: ["Vite", "Docker"] }),
      }),
    )
  })

  it("does not show structured-module editors while JD extraction is running or failed", async () => {
    for (const scenario of [
      "roleWithJobDescriptionExtracting",
      "roleWithJobDescriptionFailed",
    ] as const) {
      const { unmount } = renderReadyView(createRoleStoryResponse(scenario), {
        initialActiveTab: "job-description",
      })
      expect(await screen.findByTestId("job-description-card")).not.toHaveTextContent(
        "解析结果可按模块校正，修改后匹配分析需要重新生成。",
      )
      expect(screen.queryByTestId("job-description-analysis")).not.toBeInTheDocument()
      unmount()
    }
  })

  it("keeps the pasted JD draft when saving fails", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("singleRoleWithoutJobDescription")
    const extractJd = vi.fn(async () => {
      throw new Error("unsafe transport failure")
    })
    renderReadyView(data, {
      actions: createActions(data, { extractJd }),
      initialActiveTab: "job-description",
    })

    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.jd.actions.replace") }),
    )
    const dialog = await screen.findByRole("dialog")
    const textarea = within(dialog).getByLabelText(i18n.t("roles.jd.editor.fieldLabel"))
    await user.type(textarea, "Lead React architecture and TypeScript delivery.")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.jd.editor.save") }))

    expect(
      await within(dialog).findByText(i18n.t("roles.errors.requestFailed")),
    ).toBeInTheDocument()
    expect(textarea).toHaveValue("Lead React architecture and TypeScript delivery.")
    expect(within(dialog).queryByText("unsafe transport failure")).not.toBeInTheDocument()
  })

  it("links to profile creation when no job profile exists", async () => {
    const data = createRoleStoryResponse("profileMissing")
    renderReadyView(data, { initialActiveTab: "matching-analysis" })

    const card = await screen.findByTestId("matching-analysis-card")
    expect(card).toHaveTextContent(i18n.t("roles.matching.prerequisites.profile.missing.title"))
    expect(
      within(card).getByRole("button", {
        name: i18n.t("roles.matching.prerequisites.profile.missing.action"),
      }),
    ).toHaveAttribute("href", "/profile")
  })

  it("links to profile completion when the job profile is incomplete", async () => {
    const data = createRoleStoryResponse("profileIncomplete")
    renderReadyView(data, { initialActiveTab: "matching-analysis" })

    const card = await screen.findByTestId("matching-analysis-card")
    expect(card).toHaveTextContent(i18n.t("roles.matching.prerequisites.profile.incomplete.title"))
    expect(
      within(card).getByRole("button", {
        name: i18n.t("roles.matching.prerequisites.profile.incomplete.action"),
      }),
    ).toHaveAttribute("href", "/profile")
  })

  it.each([
    ["singleRoleWithoutJobDescription", "missing"],
    ["roleWithJobDescriptionExtracting", "extracting"],
    ["roleWithJobDescriptionFailed", "failed"],
  ] as const)("blocks analysis for %s with the %s JD guidance", async (scenario, status) => {
    const data = createRoleStoryResponse(scenario)
    renderReadyView(data, { initialActiveTab: "matching-analysis" })

    const card = await screen.findByTestId("matching-analysis-card")
    expect(card).toHaveTextContent(i18n.t(`roles.matching.prerequisites.jd.${status}.title`))
    expect(
      within(card).queryByRole("button", { name: i18n.t("roles.matching.actions.generate") }),
    ).not.toBeInTheDocument()
  })

  it("renders the complete current matching-analysis result as read-only", async () => {
    const data = createRoleStoryResponse("matchingAnalysisCurrent")
    const analysis = data.matchingByRoleId[data.targetRoles[0]!.id]!
    if (analysis?.status !== "current") throw new Error("Expected a current analysis fixture.")
    renderReadyView(data, { initialActiveTab: "matching-analysis" })

    const result = await screen.findByTestId("matching-analysis-result")
    const card = screen.getByTestId("matching-analysis-card")
    expect(
      within(result).queryByText(`${analysis.result.overallMatchScore}%`),
    ).not.toBeInTheDocument()
    expect(within(card).getByText(`${analysis.result.overallMatchScore}%`)).toHaveClass(
      "text-primary",
    )
    expect(
      within(card).queryByText(i18n.t("roles.matchStateStatus.current.label")),
    ).not.toBeInTheDocument()
    expect(result).toHaveTextContent(analysis.result.coreRequirementsSummary)
    expect(result).toHaveTextContent(analysis.result.highRiskQuestions[0]!)
    expect(within(card).queryByRole("button")).not.toBeInTheDocument()
  })

  it("keeps stale results visible and offers regeneration", async () => {
    const data = createRoleStoryResponse("matchingAnalysisStale")
    const analysis = data.matchingByRoleId[data.targetRoles[0]!.id]!
    if (analysis?.status !== "stale") throw new Error("Expected a stale analysis fixture.")
    renderReadyView(data, { initialActiveTab: "matching-analysis" })

    const card = await screen.findByTestId("matching-analysis-card")
    expect(card).toHaveTextContent(i18n.t("roles.matching.stale.title"))
    expect(card).toHaveTextContent(analysis.result.matchedCapabilities[0]!)
    expect(
      within(card).getByRole("button", { name: i18n.t("roles.matching.actions.regenerate") }),
    ).toBeEnabled()
  })

  it("keeps stale results visible while a replacement JD is extracting", async () => {
    const data = createRoleStoryResponse("matchingAnalysisStale")
    const analysis = data.matchingByRoleId[data.targetRoles[0]!.id]!
    const extractingRole = createRoleStoryResponse("roleWithJobDescriptionExtracting")
      .targetRoles[0]!
    if (analysis?.status !== "stale") {
      throw new Error("Expected stale analysis and extracting JD fixtures.")
    }
    data.targetRoles[0] = extractingRole
    data.jdTasksByRoleId[extractingRole.id] = { status: "running", error: null }
    data.matchingByRoleId[extractingRole.id] = {
      status: "blocked",
      reason: "jobDescriptionExtracting",
      result: analysis.result,
    }
    renderReadyView(data, { initialActiveTab: "matching-analysis" })

    const card = await screen.findByTestId("matching-analysis-card")
    expect(card).toHaveTextContent(i18n.t("roles.matching.stale.title"))
    expect(card).toHaveTextContent(analysis.result.matchedCapabilities[0]!)
    expect(card).toHaveTextContent(i18n.t("roles.matching.prerequisites.jd.extracting.title"))
    expect(
      within(card).queryByRole("button", { name: i18n.t("roles.matching.actions.regenerate") }),
    ).not.toBeInTheDocument()
  })

  it("keeps stale results visible when the profile becomes incomplete", async () => {
    const data = createRoleStoryResponse("matchingAnalysisStale")
    const analysis = data.matchingByRoleId[data.targetRoles[0]!.id]!
    if (analysis?.status !== "stale") {
      throw new Error("Expected stale analysis and existing profile fixtures.")
    }
    data.matchingByRoleId[data.targetRoles[0]!.id] = {
      status: "blocked",
      reason: "profileIncomplete",
      result: analysis.result,
    }
    renderReadyView(data, { initialActiveTab: "matching-analysis" })

    const card = await screen.findByTestId("matching-analysis-card")
    expect(card).toHaveTextContent(i18n.t("roles.matching.stale.title"))
    expect(card).toHaveTextContent(analysis.result.matchedCapabilities[0]!)
    expect(card).toHaveTextContent(i18n.t("roles.matching.prerequisites.profile.incomplete.title"))
    expect(
      within(card).queryByRole("button", { name: i18n.t("roles.matching.actions.regenerate") }),
    ).not.toBeInTheDocument()
  })

  it("shows a safe matching-analysis business failure and retry action", async () => {
    const data = createRoleStoryResponse("matchingAnalysisFailed")
    const analysis = data.matchingByRoleId[data.targetRoles[0]!.id]!
    if (analysis?.status !== "failed") throw new Error("Expected a failed analysis fixture.")
    renderReadyView(data, { initialActiveTab: "matching-analysis" })

    const card = await screen.findByTestId("matching-analysis-card")
    expect(card).toHaveTextContent(analysis.reason)
    expect(
      within(card).getByRole("button", { name: i18n.t("roles.matching.actions.retry") }),
    ).toBeEnabled()
  })

  it("prevents duplicate matching-analysis generation while pending", async () => {
    const user = userEvent.setup()
    const data = createRoleStoryResponse("roleWithExtractedJobDescription")
    let resolveGeneration!: (response: RoleStoryData) => void
    const match = vi.fn(
      () =>
        new Promise<RoleStoryData>((resolve) => {
          resolveGeneration = resolve
        }),
    )
    renderReadyView(data, {
      actions: createActions(data, { match }),
      initialActiveTab: "matching-analysis",
    })

    const generate = await screen.findByRole("button", {
      name: i18n.t("roles.matching.actions.generate"),
    })
    await user.click(generate)
    expect(generate).toBeDisabled()
    await user.click(generate)
    expect(match).toHaveBeenCalledTimes(1)
    expect(match).toHaveBeenCalledWith(data.targetRoles[0]!.id)
    resolveGeneration(data)
  })

  it("shows matching synchronization recovery without exposing transport errors", async () => {
    const data = createRoleStoryResponse("matchingAnalysisGenerating")
    const role = data.targetRoles[0]!
    renderReadyView(data, {
      initialActiveTab: "matching-analysis",
      matchSynchronizationErrorRoleIds: [role.id],
    })

    const card = await screen.findByTestId("matching-analysis-card")
    expect(card).toHaveTextContent(i18n.t("roles.matching.synchronization.title"))
    expect(
      within(card).getByRole("button", {
        name: i18n.t("roles.matching.actions.resynchronize"),
      }),
    ).toBeEnabled()
  })

  it("shows an explicit notice when no server current role exists", async () => {
    const data = createRoleStoryResponse("rolesWithoutCurrent")

    renderReadyView(data)

    expect(await screen.findByTestId("roles-no-current-alert")).toHaveTextContent(
      i18n.t("roles.noCurrentRole"),
    )
    expect(
      screen.getByRole("button", { name: new RegExp(data.targetRoles[0]!.title) }),
    ).toHaveAttribute("aria-pressed", "true")
  })
})
