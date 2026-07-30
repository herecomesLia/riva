import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthSessionBootstrap } from "@/app/AuthSessionBootstrap"
import { i18n } from "@/i18n/i18n"
import { userMock } from "@/mocks/data/auth"
import * as authService from "@/services/auth"
import { useAuthStore } from "@/stores/auth"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/auth")>()),
  restoreCurrentUser: vi.fn(),
}))

describe("AuthSessionBootstrap", () => {
  beforeEach(() => {
    useAuthStore.getState().clearCurrentUser()
    vi.mocked(authService.restoreCurrentUser).mockReset()
  })

  it("waits for session restoration before rendering the application", async () => {
    vi.mocked(authService.restoreCurrentUser).mockResolvedValue(userMock)

    renderWithProviders(
      <AuthSessionBootstrap>
        <p>Application content</p>
      </AuthSessionBootstrap>,
      { router: false },
    )

    expect(screen.getByText(i18n.t("app.restoringSession"))).toBeInTheDocument()
    expect(screen.queryByText("Application content")).not.toBeInTheDocument()
    expect(await screen.findByText("Application content")).toBeInTheDocument()
    expect(useAuthStore.getState().currentUser).toEqual(userMock)
    expect(authService.restoreCurrentUser).toHaveBeenCalledOnce()
  })

  it("shows an explicit retry state when session restoration fails", async () => {
    const user = userEvent.setup()
    vi.mocked(authService.restoreCurrentUser)
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(null)

    renderWithProviders(
      <AuthSessionBootstrap>
        <p>Application content</p>
      </AuthSessionBootstrap>,
      { router: false },
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("app.restoreSessionFailed"))
    await user.click(screen.getByRole("button", { name: i18n.t("app.retrySessionRestore") }))

    await waitFor(() => expect(authService.restoreCurrentUser).toHaveBeenCalledTimes(2))
    expect(await screen.findByText("Application content")).toBeInTheDocument()
    expect(useAuthStore.getState().currentUser).toBeNull()
  })
})
