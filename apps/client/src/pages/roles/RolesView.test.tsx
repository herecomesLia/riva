import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createRolesMockResponse } from "@/mocks/data/roles"
import type { RolesPageResponse } from "@/models/roles"
import { renderWithProviders } from "@/test/render"

import { RolesView, type RolesViewActions } from "./RolesView"
import { RolesActionError } from "./roles-errors"

function createActions(
  data: RolesPageResponse,
  overrides: Partial<RolesViewActions> = {},
): RolesViewActions {
  return {
    archiveTargetRole: vi.fn(async () => data),
    createTargetRole: vi.fn(async () => data),
    deleteTargetRole: vi.fn(async () => data),
    retryJobDescriptionParsing: vi.fn(async () => data),
    retryJobDescriptionSynchronization: vi.fn(async () => data),
    saveJobDescription: vi.fn(async () => data),
    setCurrentTargetRole: vi.fn(async () => data),
    updateRolePreparationStatus: vi.fn(async () => data),
    updateTargetRole: vi.fn(async () => data),
    ...overrides,
  }
}

function renderReadyView(
  data: RolesPageResponse,
  options: {
    actions?: RolesViewActions
    initialSelectedRoleId?: string
  } = {},
) {
  return renderWithProviders(
    <RolesView
      actions={options.actions ?? createActions(data)}
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
    const setCurrentTargetRole = vi.fn(async () => data)
    const data = createRolesMockResponse("multipleRoles")
    const currentRole = data.roles.find((role) => role.isCurrent)!
    const otherRole = data.roles.find((role) => !role.isCurrent)!
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

  it("validates required title, non-negative experience, and experience order", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("noRoles")
    const actions = createActions(data)
    renderReadyView(data, { actions })

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    const dialog = await screen.findByRole("dialog")
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
    const selectedRole = data.roles.find((role) => !role.isCurrent)!
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

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    const dialog = await screen.findByRole("dialog")
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

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    const dialog = await screen.findByRole("dialog")
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

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.add") }))
    const dialog = await screen.findByRole("dialog")
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
    renderReadyView(data)

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.jd.actions.add") }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText(i18n.t("roles.jd.editor.fieldLabel"))).toHaveValue("")
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.jd.editor.save") }))
    expect(await within(dialog).findByText(i18n.t("roles.jd.editor.required"))).toBeInTheDocument()
  })

  it("shows parsing without exposing structured results early", async () => {
    const data = createRolesMockResponse("roleWithJobDescriptionParsing")
    renderReadyView(data)

    const card = await screen.findByTestId("job-description-card")
    expect(card).toHaveTextContent(i18n.t("roles.jobDescriptionStatus.parsing.label"))
    expect(card).toHaveTextContent(i18n.t("roles.jobDescriptionStatus.parsing.description"))
    expect(screen.queryByTestId("job-description-analysis")).not.toBeInTheDocument()
  })

  it("shows the safe business failure and retry action", async () => {
    const data = createRolesMockResponse("roleWithJobDescriptionFailed")
    const role = data.roles[0]!
    renderReadyView(data)

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
    const retryJobDescriptionParsing = vi.fn(
      () =>
        new Promise<RolesPageResponse>((resolve) => {
          resolveRetry = resolve
        }),
    )
    renderReadyView(data, {
      actions: createActions(data, { retryJobDescriptionParsing }),
    })

    const retry = await screen.findByRole("button", { name: i18n.t("roles.jd.actions.retry") })
    await user.click(retry)

    await waitFor(() => expect(retryJobDescriptionParsing).toHaveBeenCalledTimes(1))
    expect(retry).toBeDisabled()
    resolveRetry(data)
  })

  it("renders every structured section for a ready job description", async () => {
    const data = createRolesMockResponse("roleWithParsedJobDescription")
    const analysis = data.roles[0]!.jobDescriptionAnalysis!
    renderReadyView(data)

    const result = await screen.findByTestId("job-description-analysis")
    for (const key of [
      "summary",
      "responsibilities",
      "requiredSkills",
      "preferredSkills",
      "experienceRequirements",
      "softSkills",
      "businessDomains",
      "keywords",
    ] as const) {
      expect(
        within(result).getByRole("heading", { name: i18n.t(`roles.jd.analysis.${key}`) }),
      ).toBeInTheDocument()
    }
    expect(result).toHaveTextContent(analysis.coreRequirementsSummary)
    expect(result).toHaveTextContent(analysis.responsibilities[0]!)
    expect(result).toHaveTextContent(analysis.frequentKeywords[0]!)
  })

  it("keeps the pasted JD draft when saving fails", async () => {
    const user = userEvent.setup()
    const data = createRolesMockResponse("singleRoleWithoutJobDescription")
    const saveJobDescription = vi.fn(async () => {
      throw new Error("unsafe transport failure")
    })
    renderReadyView(data, { actions: createActions(data, { saveJobDescription }) })

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
