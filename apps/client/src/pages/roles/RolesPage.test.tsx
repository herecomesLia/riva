import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createRolesMockResponse } from "@/mocks/data/roles"
import { RolesPage } from "@/pages/roles"
import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  getRolesPage,
  setCurrentTargetRole,
  updateRolePreparationStatus,
  updateTargetRole,
} from "@/services/roles"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/roles")>()),
  getRolesPage: vi.fn(),
  archiveTargetRole: vi.fn(),
  createTargetRole: vi.fn(),
  deleteTargetRole: vi.fn(),
  setCurrentTargetRole: vi.fn(),
  updateRolePreparationStatus: vi.fn(),
  updateTargetRole: vi.fn(),
}))

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function renderRolesPage() {
  return renderWithProviders(<RolesPage />, { router: { initialEntries: ["/roles"] } })
}

const mutationMocks = [
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  setCurrentTargetRole,
  updateRolePreparationStatus,
  updateTargetRole,
] as const

describe("RolesPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getRolesPage).mockReset()
    mutationMocks.forEach((mutation) => vi.mocked(mutation).mockReset())
  })

  it("maps an initial request to the stable loading layout", async () => {
    vi.mocked(getRolesPage).mockReturnValue(new Promise(() => undefined))

    renderRolesPage()

    expect(await screen.findByRole("heading", { name: i18n.t("roles.title") })).toBeInTheDocument()
    expect(screen.getByTestId("roles-loading-state")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: i18n.t("roles.list.title") })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: i18n.t("roles.details.title") })).toBeInTheDocument()
  })

  it("maps a successful request to the ready view", async () => {
    const response = createRolesMockResponse("multipleRoles")
    vi.mocked(getRolesPage).mockResolvedValue(response)

    renderRolesPage()

    expect(
      await screen.findByRole("button", { name: new RegExp(`^${response.roles[0]!.title}`) }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: new RegExp(`^${response.roles[1]!.title}`) }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("roles-loading-state")).not.toBeInTheDocument()
  })

  it("maps an empty response to the no-roles state", async () => {
    vi.mocked(getRolesPage).mockResolvedValue(createRolesMockResponse("noRoles"))

    renderRolesPage()

    expect(await screen.findByTestId("roles-empty-state")).toBeInTheDocument()
  })

  it("shows the error state and refetches after retry", async () => {
    const user = userEvent.setup()
    const firstRequest = createDeferred<ReturnType<typeof createRolesMockResponse>>()
    const secondResponse = createRolesMockResponse("singleRoleWithoutJobDescription")
    vi.mocked(getRolesPage)
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(secondResponse)

    renderRolesPage()

    await act(async () => {
      firstRequest.reject(new Error("roles failure"))
    })
    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(screen.queryByText("roles failure")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: i18n.t("roles.actions.retry") }))

    expect(
      await screen.findByRole("button", {
        name: new RegExp(`^${secondResponse.roles[0]!.title}`),
      }),
    ).toBeInTheDocument()
    expect(getRolesPage).toHaveBeenCalledTimes(2)
  })

  it("writes a create mutation response into the roles query cache", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("noRoles")
    const created = createRolesMockResponse("singleRoleWithoutJobDescription")
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(createTargetRole).mockResolvedValue(created)
    const { queryClient } = renderRolesPage()

    await screen.findByTestId("roles-empty-state")
    await user.click(screen.getByRole("button", { name: i18n.t("roles.actions.add") }))
    const dialog = await screen.findByRole("dialog")
    await user.type(
      within(dialog).getByLabelText(i18n.t("roles.editor.fields.title")),
      created.roles[0]!.title,
    )
    await user.click(within(dialog).getByRole("button", { name: i18n.t("roles.editor.save") }))

    expect(
      await screen.findByRole("button", { name: new RegExp(`^${created.roles[0]!.title}`) }),
    ).toBeInTheDocument()
    expect(queryClient.getQueryData(["roles"])).toEqual(created)
  })

  it("keeps exactly one current role after setting a different current role", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("multipleRoles")
    const next = structuredClone(initial)
    const nextCurrent = next.roles.find((role) => !role.isCurrent)!
    next.currentRoleId = nextCurrent.id
    next.roles.forEach((role) => {
      role.isCurrent = role.id === nextCurrent.id
    })
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(setCurrentTargetRole).mockResolvedValue(next)
    const { queryClient } = renderRolesPage()

    await user.click(
      await screen.findByRole("button", { name: new RegExp(`^${nextCurrent.title}`) }),
    )
    await user.click(screen.getByRole("button", { name: i18n.t("roles.actions.setCurrent") }))

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(next))
    const cached = queryClient.getQueryData<ReturnType<typeof createRolesMockResponse>>(["roles"])!
    expect(cached.roles.filter((role) => role.isCurrent)).toHaveLength(1)
    expect(cached.currentRoleId).toBe(nextCurrent.id)
  })

  it("uses the service fallback after deleting the current role", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("multipleRoles")
    const current = initial.roles.find((role) => role.isCurrent)!
    const fallback = initial.roles.find((role) => !role.isCurrent)!
    fallback.preparationStatus = "preparing"
    const response = structuredClone(initial)
    response.roles = response.roles.filter((role) => role.id !== current.id)
    response.currentRoleId = fallback.id
    response.roles[0]!.isCurrent = true
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(deleteTargetRole).mockResolvedValue(response)
    const { queryClient } = renderRolesPage()

    await user.click(await screen.findByRole("button", { name: i18n.t("roles.actions.delete") }))
    const confirmation = await screen.findByRole("alertdialog")
    await user.click(
      within(confirmation).getByRole("button", { name: i18n.t("roles.actions.delete") }),
    )

    await waitFor(() => expect(queryClient.getQueryData(["roles"])).toEqual(response))
    expect(screen.queryByRole("heading", { name: current.title })).not.toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: fallback.title })).toBeInTheDocument()
  })

  it("preserves cached data when a mutation fails", async () => {
    const user = userEvent.setup()
    const initial = createRolesMockResponse("multipleRoles")
    const otherRole = initial.roles.find((role) => !role.isCurrent)!
    vi.mocked(getRolesPage).mockResolvedValue(initial)
    vi.mocked(setCurrentTargetRole).mockRejectedValue(new Error("unsafe internal failure"))
    const { queryClient } = renderRolesPage()

    await user.click(await screen.findByRole("button", { name: new RegExp(`^${otherRole.title}`) }))
    await user.click(screen.getByRole("button", { name: i18n.t("roles.actions.setCurrent") }))

    expect(await screen.findByText(i18n.t("roles.errors.requestFailed"))).toBeInTheDocument()
    expect(queryClient.getQueryData(["roles"])).toEqual(initial)
    expect(screen.queryByText("unsafe internal failure")).not.toBeInTheDocument()
  })
})
