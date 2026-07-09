import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { userMock } from "@/mocks/data/auth"
import { LoginPage } from "@/pages/LoginPage"
import { useAuthStore } from "@/stores/auth"
import { renderWithProviders } from "@/test/render"
import { resetStores } from "@/test/stores"

function t(key: string) {
  return i18n.t(key)
}

describe("LoginPage", () => {
  beforeEach(async () => {
    resetStores()
    await i18n.changeLanguage(defaultLanguage)
  })

  it("shows username and password validation errors on empty submit", async () => {
    const user = userEvent.setup()

    renderWithProviders(<LoginPage />, {
      router: {
        initialEntries: ["/login"],
      },
    })

    await user.click(await screen.findByRole("button", { name: t("login.continue") }))

    expect(await screen.findByText(t("login.usernameRequired"))).toBeInTheDocument()
    expect(await screen.findByText(t("login.passwordRequired"))).toBeInTheDocument()
  })

  it("writes auth store after submitting username and password", async () => {
    const user = userEvent.setup()

    renderWithProviders(<LoginPage />, {
      router: {
        initialEntries: ["/login"],
      },
    })

    await user.type(await screen.findByLabelText(t("login.username")), "eleno")
    await user.type(screen.getByLabelText(t("login.password")), "secret")
    await user.click(screen.getByRole("button", { name: t("login.continue") }))

    await waitFor(() => {
      expect(useAuthStore.getState().currentUser).toEqual(userMock)
    })
  })

  it("navigates to dashboard after successful submit", async () => {
    const user = userEvent.setup()
    const { router } = renderWithProviders(<LoginPage />, {
      router: {
        initialEntries: ["/login"],
      },
    })

    await user.type(await screen.findByLabelText(t("login.username")), "eleno")
    await user.type(screen.getByLabelText(t("login.password")), "secret")
    await user.click(screen.getByRole("button", { name: t("login.continue") }))

    await waitFor(() => {
      expect(router?.state.location.pathname).toBe("/dashboard")
    })
  })
})
