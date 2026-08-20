import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createJobDescriptionImportDraftFixture } from "@/mocks/data/job-description-import"
import { createRolesMockResponse } from "@/mocks/data/roles"
import type { RolesPageResponse } from "@/models/roles"
import { renderWithProviders } from "@/test/render"

import { RolesView, type RolesViewActions } from "./RolesView"
import type { TargetRoleTab } from "./components/RoleDetails"
import { RolesActionError } from "./roles-errors"

function createActions(
  data: RolesPageResponse,
  overrides: Partial<RolesViewActions> = {},
): RolesViewActions {
  const readyDraft = createJobDescriptionImportDraftFixture("ready")
  return {
    archiveTargetRole: vi.fn(async () => data),
    createTargetRole: vi.fn(async () => data),
    deleteTargetRole: vi.fn(async () => data),
    generateMatchingAnalysis: vi.fn(async () => data),
    jobDescriptionImport: {
      applyDraft: vi.fn(async () => ({
        ...readyDraft,
        appliedRoleId: "30000000-0000-4000-8000-000000000001",
        canApply: false,
        status: "applied" as const,
      })),
      createDraft: vi.fn(async () => readyDraft),
      getDraft: vi.fn(async () => readyDraft),
      refreshRoles: vi.fn(async () => data),
    },
    startJobDescriptionParsing: vi.fn(async () => data),
    retryJobDescriptionSynchronization: vi.fn(async () => data),
    retryMatchingAnalysisSynchronization: vi.fn(async () => data),
    saveJobDescription: vi.fn(async () => data),
    setCurrentTargetRole: vi.fn(async () => data),
    updateRolePreparationStatus: vi.fn(async () => data),
    updateJobDescriptionAnalysisModule: vi.fn(async () => data),
    updateTargetRole: vi.fn(async () => data),
    ...overrides,
  }
}

async function openManualRoleEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
  const chooser = await screen.findByRole("dialog", {
    name: i18n.t("roles.creationMethod.title"),
  })
  await user.click(
    within(chooser).getByRole("button", { name: i18n.t("roles.creationMethod.manual.action") }),
  )
  return screen.findByRole("dialog", { name: i18n.t("roles.editor.create.title") })
}

function renderReadyView(
  data: RolesPageResponse,
  options: {
    actions?: RolesViewActions
    initialActiveTab?: TargetRoleTab
    initialSelectedRoleId?: string
    jobDescriptionSynchronizationErrorRoleIds?: string[]
    matchingAnalysisSynchronizationErrorRoleIds?: string[]
  } = {},
) {
  return renderWithProviders(
    <RolesView
      actions={options.actions ?? createActions(data)}
      content={{ status: "ready", data }}
      initialActiveTab={options.initialActiveTab}
      initialSelectedRoleId={options.initialSelectedRoleId}
      jobDescriptionSynchronizationErrorRoleIds={options.jobDescriptionSynchronizationErrorRoleIds}
      matchingAnalysisSynchronizationErrorRoleIds={
        options.matchingAnalysisSynchronizationErrorRoleIds
      }
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

  it("shows My roles with saved and archived categories, filtering the visible list locally", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("archivedRoles")
    const savedRole = data.roles.find((role) => role.preparationStatus !== "archived")!
    const archivedRole = data.roles.find((role) => role.preparationStatus === "archived")!
    renderReadyView(data)

    const desktopNavigation = await screen.findByTestId("roles-desktop-navigation")
    expect(
      await screen.findByRole("heading", { name: i18n.t("roles.list.title") }),
    ).toBeInTheDocument()
    expect(desktopNavigation).not.toHaveTextContent(i18n.t("roles.list.description"))
    expect(
      within(desktopNavigation).getByRole("tab", {
        name: i18n.t("roles.list.categories.saved", { count: 1 }),
      }),
    ).toHaveAttribute("aria-selected", "true")
    const savedList = within(desktopNavigation).getByRole("list", {
      name: i18n.t("roles.list.title"),
    })
    expect(within(savedList).getByText(savedRole.title)).toBeInTheDocument()
    expect(within(savedList).queryByText(archivedRole.title)).not.toBeInTheDocument()

    await user.click(
      within(desktopNavigation).getByRole("tab", {
        name: i18n.t("roles.list.categories.archived", { count: 1 }),
      }),
    )

    const archivedList = within(desktopNavigation).getByRole("list", {
      name: i18n.t("roles.list.title"),
    })
    expect(within(archivedList).getByText(archivedRole.title)).toBeInTheDocument()
    expect(within(archivedList).queryByText(savedRole.title)).not.toBeInTheDocument()
    expect(screen.getByTestId("role-details-card")).toHaveTextContent(archivedRole.title)
  })

  it("shows match-score rings only for current or stale analyses and greys archived score indicators", async () => {
    const data = createRolesMockResponse("archivedRoles")
    const currentRole = data.roles.find((role) => role.id === data.currentRoleId)!
    const archivedRole = data.roles.find((role) => role.preparationStatus === "archived")!
    archivedRole.matchingAnalysis = structuredClone(currentRole.matchingAnalysis)
    renderReadyView(data, { initialSelectedRoleId: archivedRole.id })

    const archivedButton = await screen.findByRole("button", {
      name: new RegExp(`^${archivedRole.title}`),
    })
    const scoreRing = within(archivedButton).getByTestId("role-match-score-ring")
    const statusBadges = within(archivedButton).getByTestId("role-status-badges")

    expect(scoreRing).toHaveTextContent("78%")
    expect(scoreRing).toHaveAttribute("data-role-status", "archived")
    expect(
      within(statusBadges).getByText(i18n.t("roles.preparationStatus.archived")),
    ).toHaveAttribute("data-role-status", "archived")
  })

  it("keeps the navigation available when the chosen category is empty", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("multipleRoles")
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
        name: i18n.t("roles.list.categories.saved", { count: 2 }),
      }),
    )
    expect(screen.getByTestId("role-details-card")).toBeInTheDocument()
  })

  it("does not reserve a match-score ring for roles without an eligible analysis", async () => {
    const data = createRolesMockResponse("multipleRoles")
    const roleWithoutAnalysis = data.roles.find((role) => role.matchingAnalysis === null)!
    renderReadyView(data)

    const button = await screen.findByRole("button", {
      name: new RegExp(`^${roleWithoutAnalysis.title}`),
    })
    expect(within(button).queryByTestId("role-match-score-ring")).not.toBeInTheDocument()
  })

  it("keeps selected role separate from the server current role", async () => {
    const data = createRolesMockResponse("multipleRoles")
    const currentRole = data.roles.find((role) => role.id === data.currentRoleId)!
    const selectedRole = data.roles.find((role) => role.id !== data.currentRoleId)!
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
    const setCurrentTargetRole = vi.fn(async () => data)
    const data = createRolesMockResponse("multipleRoles")
    const currentRole = data.roles.find((role) => role.id === data.currentRoleId)!
    const otherRole = data.roles.find((role) => role.id !== data.currentRoleId)!
    renderReadyView(data, { actions: createActions(data, { setCurrentTargetRole }) })

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

  it("defaults to overview and keeps inactive tab content out of the document", async () => {
    const data = createRolesMockResponse("roleWithParsedJobDescription")
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
    renderReadyView(createRolesMockResponse("matchingAnalysisCurrent"))

    await user.click(await screen.findByRole("tab", { name: i18n.t("roles.tabs.jobDescription") }))
    expect(screen.getByTestId("job-description-card")).toBeInTheDocument()
    expect(screen.queryByTestId("target-role-overview")).not.toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: i18n.t("roles.tabs.matchingAnalysis") }))
    expect(screen.getByTestId("matching-analysis-card")).toBeInTheDocument()
    expect(screen.queryByTestId("job-description-card")).not.toBeInTheDocument()
  })

  it("keeps the tab strip horizontally scrollable while explicitly hiding vertical overflow", async () => {
    renderReadyView(createRolesMockResponse("matchingAnalysisCurrent"))

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
    const data = createRolesMockResponse("multipleRoles")
    const currentRole = data.roles.find((role) => role.id === data.currentRoleId)!
    const otherRole = data.roles.find((role) => role.id !== data.currentRoleId)!
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
    const data = createRolesMockResponse("matchingAnalysisCurrent")
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
    const data = createRolesMockResponse("multipleRoles")
    const currentRole = data.roles.find((role) => role.id === data.currentRoleId)!
    const otherRole = data.roles.find((role) => role.id !== data.currentRoleId)!
    const setCurrentTargetRole = vi.fn(async () => data)
    renderReadyView(data, { actions: createActions(data, { setCurrentTargetRole }) })

    await user.click(await screen.findByTestId("mobile-role-selector-trigger"))
    await user.click(await screen.findByRole("option", { name: new RegExp(otherRole.title) }))

    expect(screen.getByTestId("role-details-card")).toHaveTextContent(otherRole.title)
    expect(setCurrentTargetRole).not.toHaveBeenCalled()
    expect(
      within(screen.getByRole("button", { name: new RegExp(`^${currentRole.title}`) })).getByText(
        i18n.t("roles.badges.current"),
      ),
    ).toBeInTheDocument()
  })

  it("keeps saved and archived categories available in the mobile selector", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("archivedRoles")
    const archivedRole = data.roles.find((role) => role.preparationStatus === "archived")!
    const setCurrentTargetRole = vi.fn(async () => data)
    renderReadyView(data, { actions: createActions(data, { setCurrentTargetRole }) })

    const mobileSelector = await screen.findByTestId("mobile-role-selector")
    await user.click(
      within(mobileSelector).getByRole("tab", {
        name: i18n.t("roles.list.categories.archived", { count: 1 }),
      }),
    )

    expect(screen.getByTestId("role-details-card")).toHaveTextContent(archivedRole.title)
    expect(setCurrentTargetRole).not.toHaveBeenCalled()
  })

  it("falls back to the current role after a selected role disappears and preserves the tab", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("multipleRoles")
    const currentRole = data.roles.find((role) => role.id === data.currentRoleId)!
    const selectedRole = data.roles.find((role) => role.id !== data.currentRoleId)!
    const actions = createActions(data)
    const view = renderReadyView(data, {
      actions,
      initialSelectedRoleId: selectedRole.id,
    })
    await user.click(
      await screen.findByRole("tab", { name: i18n.t("roles.tabs.matchingAnalysis") }),
    )

    const nextData = structuredClone(data)
    nextData.roles = nextData.roles.filter((role) => role.id !== selectedRole.id)
    view.rerender(
      <RolesView
        actions={actions}
        content={{ status: "ready", data: nextData }}
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
    renderReadyView(createRolesMockResponse("multipleRoles"))

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
    const data = createRolesMockResponse("multipleRoles")
    const currentRole = data.roles.find((role) => role.id === data.currentRoleId)!
    const otherRole = data.roles.find((role) => role.id !== data.currentRoleId)!
    renderReadyView(data)

    const roleButton = await screen.findByRole("button", {
      name: new RegExp(`^${currentRole.title}`),
    })
    expect(roleButton).toHaveClass(
      "border",
      "focus-visible:border-primary",
      "focus-visible:ring-1",
      "active:not-aria-[haspopup]:translate-y-0",
    )
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

  it("validates required title, non-negative experience, and experience order", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("noRoles")
    const actions = createActions(data)
    renderReadyView(data, { actions })

    const dialog = await openManualRoleEditor(user)
    const minimumExperience = within(dialog).getByLabelText(i18n.t("roles.editor.fields.minYears"))
    fireEvent.change(minimumExperience, { target: { value: "-1" } })
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.editor.save") }))
    expect(
      await within(dialog).findByText(i18n.t("roles.editor.validation.required")),
    ).toBeInTheDocument()
    expect(
      await within(dialog).findByText(i18n.t("roles.editor.validation.nonNegative")),
    ).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(i18n.t("roles.editor.fields.title")), "SRE")
    await user.clear(minimumExperience)
    await user.type(minimumExperience, "5")
    await user.type(within(dialog).getByLabelText(i18n.t("roles.editor.fields.maxYears")), "2")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.editor.save") }))
    expect(
      await within(dialog).findByText(i18n.t("roles.editor.validation.experienceRange")),
    ).toBeInTheDocument()

    expect(actions.createTargetRole).not.toHaveBeenCalled()
  })

  it("chooses independent current and preparation actions with the selected role version", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("multipleRoles")
    const selectedRole = data.roles.find((role) => role.id !== data.currentRoleId)!
    const actions = createActions(data)
    renderReadyView(data, { actions, initialSelectedRoleId: selectedRole.id })

    await user.click(
      await screen.findByRole("button", { name: i18n.t("roles.actions.setCurrent") }),
    )
    expect(actions.setCurrentTargetRole).toHaveBeenCalledWith({
      roleId: selectedRole.id,
      version: selectedRole.version,
    })

    await user.click(screen.getByRole("button", { name: i18n.t("roles.actions.resume") }))
    expect(actions.updateRolePreparationStatus).toHaveBeenCalledWith({
      roleId: selectedRole.id,
      version: selectedRole.version,
      preparationStatus: "preparing",
    })
  })

  it("prevents duplicate form submissions while a save is pending", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("noRoles")
    let resolveSave!: (value: RolesPageResponse) => void
    const pendingSave = new Promise<RolesPageResponse>((resolve) => {
      resolveSave = resolve
    })
    const createTargetRole = vi.fn(() => pendingSave)
    renderReadyView(data, { actions: createActions(data, { createTargetRole }) })

    const dialog = await openManualRoleEditor(user)
    await user.type(
      within(dialog).getByLabelText(i18n.t("roles.editor.fields.title")),
      "Data Engineer",
    )
    const save = within(dialog).getByRole("button", { name: i18n.t("roles.editor.save") })
    await user.click(save)

    await waitFor(() => expect(createTargetRole).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(save).toBeDisabled())
    resolveSave(data)
  })

  it("closes after a successful edit save", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("singleRoleWithoutJobDescription")
    const actions = createActions(data)
    renderReadyView(data, { actions })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    const title = within(dialog).getByLabelText(i18n.t("roles.editor.fields.title"))
    await user.clear(title)
    await user.type(title, "Staff Frontend Engineer")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.editor.save") }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(actions.updateTargetRole).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Staff Frontend Engineer",
        version: data.roles[0]!.version,
      }),
    )
  })

  it("shows a safe version-conflict error and preserves a failed draft", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("singleRoleWithoutJobDescription")
    const updateTargetRole = vi.fn(async () => {
      throw new RolesActionError("versionConflict")
    })
    renderReadyView(data, { actions: createActions(data, { updateTargetRole }) })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.edit") }))
    const dialog = await screen.findByRole("dialog")
    const title = within(dialog).getByLabelText(i18n.t("roles.editor.fields.title"))
    await user.clear(title)
    await user.type(title, "Unsaved Staff Engineer")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.editor.save") }))

    expect(
      await within(dialog).findByText(i18n.t("roles.errors.versionConflict")),
    ).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("Unsaved Staff Engineer")).toBeInTheDocument()
    expect(within(dialog).queryByText("versionConflict")).not.toBeInTheDocument()
  })

  it("requires destructive confirmation before deleting", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("singleRoleWithoutJobDescription")
    const actions = createActions(data)
    renderReadyView(data, { actions })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.delete") }))
    expect(actions.deleteTargetRole).not.toHaveBeenCalled()
    const confirmation = await screen.findByRole("alertdialog")
    await user.click(
      within(confirmation).getByRole("button", { name: i18n.t("roles.actions.delete") }),
    )
    expect(actions.deleteTargetRole).toHaveBeenCalledWith({
      roleId: data.roles[0]!.id,
      version: data.roles[0]!.version,
    })
  })

  it("confirms before closing a dirty editor", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("noRoles")
    renderReadyView(data)

    const dialog = await openManualRoleEditor(user)
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
    const data = createRolesMockResponse("noRoles")
    const { router } = renderReadyView(data)

    const dialog = await openManualRoleEditor(user)
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
    const data = createRolesMockResponse("singleRoleWithoutJobDescription")
    renderReadyView(data, { initialActiveTab: "job-description" })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.jd.actions.add") }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText(i18n.t("roles.jd.editor.fieldLabel"))).toHaveValue("")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.jd.editor.save") }))
    expect(await within(dialog).findByText(i18n.t("roles.jd.editor.required"))).toBeInTheDocument()
  })

  it("shows parsing without exposing structured results early", async () => {
    const data = createRolesMockResponse("roleWithJobDescriptionParsing")
    renderReadyView(data, { initialActiveTab: "job-description" })

    const card = await screen.findByTestId("job-description-card")
    expect(card).toHaveTextContent(i18n.t("roles.jobDescriptionStatus.parsing.description"))
    expect(screen.queryByTestId("job-description-analysis")).not.toBeInTheDocument()
  })

  it("keeps a JD synchronization error accessible from the JD tab", async () => {
    const data = createRolesMockResponse("roleWithJobDescriptionParsing")
    const role = data.roles[0]!
    renderReadyView(data, {
      initialActiveTab: "job-description",
      jobDescriptionSynchronizationErrorRoleIds: [role.id],
    })

    const card = await screen.findByTestId("job-description-card")
    expect(card).toHaveTextContent(i18n.t("roles.jd.synchronization.title"))
    expect(
      within(card).getByRole("button", { name: i18n.t("roles.jd.actions.resynchronize") }),
    ).toBeEnabled()
  })

  it("starts parsing a saved JD with the current role and JD versions", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("singleRoleWithoutJobDescription")
    const role = data.roles[0]!
    if (role.jobDescription.status !== "missing") {
      throw new Error("Expected a missing JD fixture.")
    }
    data.roles[0] = {
      ...role,
      jobDescription: {
        parsingFailureReason: null,
        rawText: "Build reliable APIs.",
        status: "saved",
        version: 4,
      },
      jobDescriptionAnalysis: null,
    }
    const startJobDescriptionParsing = vi.fn(async () => data)
    renderReadyView(data, {
      actions: createActions(data, { startJobDescriptionParsing }),
      initialActiveTab: "job-description",
    })

    const card = await screen.findByTestId("job-description-card")
    await user.click(
      within(card).getByRole("button", { name: i18n.t("roles.jd.actions.startParsing") }),
    )

    await waitFor(() => expect(startJobDescriptionParsing).toHaveBeenCalledTimes(1))
    expect(startJobDescriptionParsing).toHaveBeenCalledWith({
      jobDescriptionVersion: 4,
      roleId: role.id,
      version: role.version,
    })
  })

  it("shows the safe business failure and retry action", async () => {
    const data = createRolesMockResponse("roleWithJobDescriptionFailed")
    const role = data.roles[0]!
    renderReadyView(data, { initialActiveTab: "job-description" })

    const card = await screen.findByTestId("job-description-card")
    expect(card).toHaveTextContent(role.jobDescription.parsingFailureReason!)
    expect(
      within(card).getByRole("button", { name: i18n.t("roles.jd.actions.retry") }),
    ).toBeEnabled()
  })

  it("disables retry while a failed parse retry is pending", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("roleWithJobDescriptionFailed")
    let resolveRetry!: (response: RolesPageResponse) => void
    const startJobDescriptionParsing = vi.fn(
      () =>
        new Promise<RolesPageResponse>((resolve) => {
          resolveRetry = resolve
        }),
    )
    renderReadyView(data, {
      actions: createActions(data, { startJobDescriptionParsing }),
      initialActiveTab: "job-description",
    })

    const retry = await screen.findByRole("button", { name: i18n.t("roles.jd.actions.retry") })
    await user.click(retry)

    await waitFor(() => expect(startJobDescriptionParsing).toHaveBeenCalledTimes(1))
    expect(retry).toBeDisabled()
    resolveRetry(data)
  })

  it("renders every structured section for a ready job description", async () => {
    const data = createRolesMockResponse("roleWithParsedJobDescription")
    const analysis = data.roles[0]!.jobDescriptionAnalysis!
    renderReadyView(data, { initialActiveTab: "job-description" })

    const result = await screen.findByTestId("job-description-analysis")
    for (const key of [
      "rivaSummary",
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
    expect(
      within(result).queryByRole("button", {
        name: i18n.t("roles.jd.actions.editModuleLabel", {
          module: i18n.t("roles.jd.analysis.rivaSummary"),
        }),
      }),
    ).not.toBeInTheDocument()
    expect(result).not.toHaveTextContent("解析结果可按模块校正，修改后匹配分析需要重新生成。")
    expect(result).not.toHaveTextContent("高频关键词")
    expect(result).toHaveTextContent(analysis.rivaSummary)
    expect(result).toHaveTextContent(analysis.responsibilities[0]!)
    expect(result).toHaveTextContent(analysis.requiredSkills.programmingLanguages[0]!)
    for (const key of [
      "rivaSummary",
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

  it("opens a module-specific editor without opening the JD source editor", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("roleWithParsedJobDescription")
    const updateJobDescriptionAnalysisModule = vi.fn(async () => data)
    renderReadyView(data, {
      actions: createActions(data, { updateJobDescriptionAnalysisModule }),
      initialActiveTab: "job-description",
    })

    const summaryTitle = i18n.t("roles.jd.analysis.preferredQualifications")
    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("roles.jd.actions.editModuleLabel", { module: summaryTitle }),
      }),
    )
    const dialog = await screen.findByRole("dialog")
    const textarea = within(dialog).getByLabelText(`${summaryTitle} 1`)
    expect(textarea).toHaveValue(data.roles[0]!.jobDescriptionAnalysis!.preferredQualifications[0])
    expect(
      within(dialog).queryByLabelText(i18n.t("roles.jd.editor.fieldLabel")),
    ).not.toBeInTheDocument()

    await user.clear(textarea)
    await user.type(textarea, "Corrected structured qualification.")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.jd.actions.saveCorrection") }),
    )
    expect(updateJobDescriptionAnalysisModule).toHaveBeenCalledWith(
      expect.objectContaining({
        field: "preferredQualifications",
        value: ["Corrected structured qualification.", "熟悉无障碍设计"],
      }),
    )
  })

  it("renders only non-empty qualification and skill categories, while keeping preferred items semantic lists", async () => {
    const data = createRolesMockResponse("roleWithParsedJobDescription")
    const analysis = data.roles[0]!.jobDescriptionAnalysis!
    analysis.qualificationRequirements = {
      education: ["本科及以上"],
      graduationCohorts: [],
      majors: ["计算机相关专业"],
      experience: [],
      languages: [],
      certifications: [],
      other: [],
    }
    analysis.requiredSkills = {
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
    const data = createRolesMockResponse("roleWithParsedJobDescription")
    const updateJobDescriptionAnalysisModule = vi.fn(async () => data)
    renderReadyView(data, {
      actions: createActions(data, { updateJobDescriptionAnalysisModule }),
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
    expect(education).toHaveValue("本科及以上")
    await user.click(
      within(dialog).getAllByRole("button", {
        name: i18n.t("roles.jd.analysisEditor.addRequirement"),
      })[1]!,
    )
    const graduationCohorts = within(dialog).getByLabelText(
      `${i18n.t("roles.jd.analysis.qualificationCategories.graduationCohorts")} 1`,
    )
    await user.type(graduationCohorts, "2027 届")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.jd.actions.saveCorrection") }),
    )
    expect(updateJobDescriptionAnalysisModule).toHaveBeenCalledWith(
      expect.objectContaining({
        field: "qualificationRequirements",
        value: expect.objectContaining({ graduationCohorts: ["2027 届"] }),
      }),
    )
  })

  it("keeps qualification clauses and preferred conditions intact while editing", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("roleWithParsedJobDescription")
    const role = data.roles[0]!
    const analysis = role.jobDescriptionAnalysis!
    analysis.qualificationRequirements.majors = ["计算机科学、软件工程或相关专业"]
    analysis.requiredSkills.programmingLanguages = ["Python", "Go"]
    analysis.preferredQualifications = ["有 Kubernetes 或云平台使用经验"]
    const updateJobDescriptionAnalysisModule = vi.fn(async () => data)
    renderReadyView(data, {
      actions: createActions(data, { updateJobDescriptionAnalysisModule }),
      initialActiveTab: "job-description",
    })

    const result = await screen.findByTestId("job-description-analysis")
    const qualificationSection = within(result)
      .getByRole("heading", { name: i18n.t("roles.jd.analysis.qualificationRequirements") })
      .closest("section")!
    const majorRequirement = "计算机科学、软件工程或相关专业"
    expect(within(qualificationSection).getAllByText(majorRequirement)).toHaveLength(1)
    const preferredSection = within(result)
      .getByRole("heading", { name: i18n.t("roles.jd.analysis.preferredQualifications") })
      .closest("section")!
    expect(within(preferredSection).getAllByRole("listitem")).toHaveLength(1)
    expect(within(preferredSection).getByText("有 Kubernetes 或云平台使用经验")).toBeInTheDocument()

    await user.click(
      within(preferredSection).getByRole("button", {
        name: i18n.t("roles.jd.actions.editModuleLabel", {
          module: i18n.t("roles.jd.analysis.preferredQualifications"),
        }),
      }),
    )
    let dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByLabelText(`${i18n.t("roles.jd.analysis.preferredQualifications")} 1`),
    ).toHaveValue("有 Kubernetes 或云平台使用经验")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.editor.cancel") }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    const requiredSkillsSection = within(result)
      .getByRole("heading", { name: i18n.t("roles.jd.analysis.requiredSkills") })
      .closest("section")!
    expect(within(requiredSkillsSection).getAllByText("Python")).toHaveLength(1)
    expect(within(requiredSkillsSection).getAllByText("Go")).toHaveLength(1)

    await user.click(
      within(qualificationSection).getByRole("button", {
        name: i18n.t("roles.jd.actions.editModuleLabel", {
          module: i18n.t("roles.jd.analysis.qualificationRequirements"),
        }),
      }),
    )
    dialog = await screen.findByRole("dialog")
    const majors = i18n.t("roles.jd.analysis.qualificationCategories.majors")
    const majorInput = within(dialog).getByLabelText(`${majors} 1`)
    expect(majorInput).toHaveValue(majorRequirement)
    expect(within(dialog).queryByLabelText(`${majors} 2`)).not.toBeInTheDocument()

    await user.click(
      within(dialog).getAllByRole("button", {
        name: i18n.t("roles.jd.analysisEditor.addRequirement"),
      })[2]!,
    )
    const secondMajorInput = await within(dialog).findByLabelText(`${majors} 2`)
    await user.type(secondMajorInput, "人工智能、机器学习相关方向")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.jd.actions.saveCorrection") }),
    )

    expect(updateJobDescriptionAnalysisModule).toHaveBeenCalledWith(
      expect.objectContaining({
        field: "qualificationRequirements",
        value: expect.objectContaining({
          majors: [majorRequirement, "人工智能、机器学习相关方向"],
        }),
      }),
    )

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await user.click(
      within(result).getByRole("button", {
        name: i18n.t("roles.jd.actions.editModuleLabel", {
          module: i18n.t("roles.jd.analysis.requiredSkills"),
        }),
      }),
    )
    dialog = await screen.findByRole("dialog")
    const programmingLanguages = i18n.t("roles.jd.analysis.skillCategories.programmingLanguages")
    expect(within(dialog).getByLabelText(`${programmingLanguages} 1`)).toHaveValue("Python")
    expect(within(dialog).getByLabelText(`${programmingLanguages} 2`)).toHaveValue("Go")
  })

  it("prefills and submits all required-skill categories together", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("roleWithParsedJobDescription")
    const updateJobDescriptionAnalysisModule = vi.fn(async () => data)
    renderReadyView(data, {
      actions: createActions(data, { updateJobDescriptionAnalysisModule }),
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
      `${i18n.t("roles.jd.analysis.skillCategories.tools")} 1`,
    )
    await user.type(tools, "Docker")
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("roles.jd.actions.saveCorrection") }),
    )
    expect(updateJobDescriptionAnalysisModule).toHaveBeenCalledWith(
      expect.objectContaining({
        field: "requiredSkills",
        value: expect.objectContaining({ tools: ["Docker"] }),
      }),
    )
  })

  it("only shows structured-module editors after JD parsing is ready", async () => {
    for (const scenario of [
      "singleRoleWithoutJobDescription",
      "roleWithJobDescriptionParsing",
      "roleWithJobDescriptionFailed",
    ] as const) {
      const { unmount } = renderReadyView(createRolesMockResponse(scenario), {
        initialActiveTab: "job-description",
      })
      expect(await screen.findByTestId("job-description-card")).not.toHaveTextContent(
        "解析结果可按模块校正，修改后匹配分析需要重新生成。",
      )
      unmount()
    }
  })

  it("keeps the pasted JD draft when saving fails", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("singleRoleWithoutJobDescription")
    const saveJobDescription = vi.fn(async () => {
      throw new Error("unsafe transport failure")
    })
    renderReadyView(data, {
      actions: createActions(data, { saveJobDescription }),
      initialActiveTab: "job-description",
    })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.jd.actions.add") }))
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
    const data = createRolesMockResponse("profileMissing")
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
    const data = createRolesMockResponse("profileIncomplete")
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
    ["roleWithJobDescriptionParsing", "parsing"],
    ["roleWithJobDescriptionFailed", "failed"],
  ] as const)("blocks analysis for %s with the %s JD guidance", async (scenario, status) => {
    const data = createRolesMockResponse(scenario)
    renderReadyView(data, { initialActiveTab: "matching-analysis" })

    const card = await screen.findByTestId("matching-analysis-card")
    expect(card).toHaveTextContent(i18n.t(`roles.matching.prerequisites.jd.${status}.title`))
    expect(
      within(card).queryByRole("button", { name: i18n.t("roles.matching.actions.generate") }),
    ).not.toBeInTheDocument()
  })

  it("renders the complete current matching-analysis result as read-only", async () => {
    const data = createRolesMockResponse("matchingAnalysisCurrent")
    const analysis = data.roles[0]!.matchingAnalysis
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
      within(card).queryByText(i18n.t("roles.matchingAnalysisStatus.current.label")),
    ).not.toBeInTheDocument()
    expect(result).toHaveTextContent(analysis.result.coreRequirementsSummary)
    expect(result).toHaveTextContent(analysis.result.highRiskQuestions[0]!)
    expect(within(card).queryByRole("button")).not.toBeInTheDocument()
  })

  it("keeps stale results visible and offers regeneration", async () => {
    const data = createRolesMockResponse("matchingAnalysisStale")
    const analysis = data.roles[0]!.matchingAnalysis
    if (analysis?.status !== "stale") throw new Error("Expected a stale analysis fixture.")
    renderReadyView(data, { initialActiveTab: "matching-analysis" })

    const card = await screen.findByTestId("matching-analysis-card")
    expect(card).toHaveTextContent(i18n.t("roles.matching.stale.title"))
    expect(card).toHaveTextContent(analysis.result.matchedCapabilities[0]!)
    expect(
      within(card).getByRole("button", { name: i18n.t("roles.matching.actions.regenerate") }),
    ).toBeEnabled()
  })

  it("keeps stale results visible while a replacement JD is parsing", async () => {
    const data = createRolesMockResponse("matchingAnalysisStale")
    const analysis = data.roles[0]!.matchingAnalysis
    const parsingRole = createRolesMockResponse("roleWithJobDescriptionParsing").roles[0]!
    if (analysis?.status !== "stale" || parsingRole.jobDescription.status !== "parsing") {
      throw new Error("Expected stale analysis and parsing JD fixtures.")
    }
    data.roles[0] = {
      ...parsingRole,
      matchingAnalysis: structuredClone(analysis),
    }
    renderReadyView(data, { initialActiveTab: "matching-analysis" })

    const card = await screen.findByTestId("matching-analysis-card")
    expect(card).toHaveTextContent(i18n.t("roles.matching.stale.title"))
    expect(card).toHaveTextContent(analysis.result.matchedCapabilities[0]!)
    expect(card).toHaveTextContent(i18n.t("roles.matching.prerequisites.jd.parsing.title"))
    expect(
      within(card).queryByRole("button", { name: i18n.t("roles.matching.actions.regenerate") }),
    ).not.toBeInTheDocument()
  })

  it("keeps stale results visible when the profile becomes incomplete", async () => {
    const data = createRolesMockResponse("matchingAnalysisStale")
    const analysis = data.roles[0]!.matchingAnalysis
    if (analysis?.status !== "stale" || !data.profileContext.exists) {
      throw new Error("Expected stale analysis and existing profile fixtures.")
    }
    data.profileContext.completed = false
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
    const data = createRolesMockResponse("matchingAnalysisFailed")
    const analysis = data.roles[0]!.matchingAnalysis
    if (analysis?.status !== "failed") throw new Error("Expected a failed analysis fixture.")
    renderReadyView(data, { initialActiveTab: "matching-analysis" })

    const card = await screen.findByTestId("matching-analysis-card")
    expect(card).toHaveTextContent(analysis.failureReason)
    expect(
      within(card).getByRole("button", { name: i18n.t("roles.matching.actions.retry") }),
    ).toBeEnabled()
  })

  it("prevents duplicate matching-analysis generation while pending", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("roleWithParsedJobDescription")
    let resolveGeneration!: (response: RolesPageResponse) => void
    const generateMatchingAnalysis = vi.fn(
      () =>
        new Promise<RolesPageResponse>((resolve) => {
          resolveGeneration = resolve
        }),
    )
    renderReadyView(data, {
      actions: createActions(data, { generateMatchingAnalysis }),
      initialActiveTab: "matching-analysis",
    })

    const generate = await screen.findByRole("button", {
      name: i18n.t("roles.matching.actions.generate"),
    })
    await user.click(generate)
    expect(generate).toBeDisabled()
    await user.click(generate)
    expect(generateMatchingAnalysis).toHaveBeenCalledTimes(1)
    expect(generateMatchingAnalysis).toHaveBeenCalledWith({
      roleId: data.roles[0]!.id,
      version: data.roles[0]!.version,
    })
    resolveGeneration(data)
  })

  it("shows matching synchronization recovery without exposing transport errors", async () => {
    const data = createRolesMockResponse("matchingAnalysisGenerating")
    const role = data.roles[0]!
    renderReadyView(data, {
      initialActiveTab: "matching-analysis",
      matchingAnalysisSynchronizationErrorRoleIds: [role.id],
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
    const data = createRolesMockResponse("rolesWithoutCurrent")

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
