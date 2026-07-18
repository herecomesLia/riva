import { act, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createRolesMockResponse } from "@/mocks/data/roles"
import { RolesPage } from "@/pages/roles"
import { getRolesPage } from "@/services/roles"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/roles")>()),
  getRolesPage: vi.fn(),
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

describe("RolesPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
    vi.mocked(getRolesPage).mockReset()
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
})
