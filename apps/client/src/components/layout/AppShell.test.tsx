import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { AppShell } from "@/components/layout/AppShell"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { useAuthStore } from "@/stores/auth"
import { renderWithProviders } from "@/test/render"
import { resetStores } from "@/test/stores"

function t(key: string) {
  return i18n.t(key)
}

function translatedNamePattern(key: string) {
  return new RegExp(t(key))
}

describe("AppShell", () => {
  beforeEach(async () => {
    resetStores()
    await i18n.changeLanguage(defaultLanguage)
  })

  it("renders all navigation items", async () => {
    renderWithProviders(<AppShell />, {
      router: {
        initialEntries: ["/dashboard"],
      },
    })

    expect(
      await screen.findByRole("link", {
        name: translatedNamePattern("appShell.nav.dashboard"),
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", {
        name: translatedNamePattern("appShell.nav.profile"),
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", {
        name: translatedNamePattern("appShell.nav.roles"),
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", {
        name: translatedNamePattern("appShell.nav.practice"),
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", {
        name: translatedNamePattern("appShell.nav.interview"),
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", {
        name: translatedNamePattern("appShell.nav.history"),
      }),
    ).toBeInTheDocument()
  })

  it("shows the current route title in the top bar", async () => {
    renderWithProviders(<AppShell />, {
      router: {
        initialEntries: ["/practice"],
      },
    })

    expect(
      await screen.findByRole("heading", { name: t("appShell.nav.practice") }),
    ).toBeInTheDocument()
  })

  it("clears auth store and navigates to login after sign out", async () => {
    const user = userEvent.setup()
    useAuthStore.getState().signIn("eleno")
    const { router } = renderWithProviders(<AppShell />, {
      router: {
        initialEntries: ["/dashboard"],
      },
    })

    await user.click(await screen.findByRole("button", { name: /eleno/ }))
    await user.click(await screen.findByText(t("appShell.signOut")))

    await waitFor(() => {
      expect(useAuthStore.getState()).toMatchObject({
        currentUser: null,
        isAuthenticated: false,
        session: null,
      })
      expect(router?.state.location.pathname).toBe("/login")
    })
  })
})
