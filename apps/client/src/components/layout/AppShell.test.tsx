import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppShell } from "@/components/layout/AppShell"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { userMock } from "@/mocks/data/auth"
import { useAuthStore } from "@/stores/auth"
import { renderWithProviders } from "@/test/render"
import { resetStores } from "@/test/stores"

vi.mock("@/services/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/auth")>()),
  logout: vi.fn(),
}))

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

  it("shows today's localized date in the practice top bar", async () => {
    renderWithProviders(<AppShell />, {
      router: {
        initialEntries: ["/practice"],
      },
    })

    const today = new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" }).format(new Date())

    expect(await screen.findByRole("heading", { name: today })).toBeInTheDocument()
  })

  it("shows today's localized date in the dashboard top bar", async () => {
    renderWithProviders(<AppShell />, {
      router: {
        initialEntries: ["/dashboard"],
      },
    })

    const today = new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" }).format(new Date())

    expect(await screen.findByRole("heading", { name: today })).toBeInTheDocument()
  })

  it("clears auth store and navigates to login after sign out", async () => {
    const user = userEvent.setup()
    const { logout } = await import("@/services/auth")
    vi.mocked(logout).mockResolvedValue()
    useAuthStore.getState().setCurrentUser(userMock)
    const { router } = renderWithProviders(<AppShell />, {
      router: {
        initialEntries: ["/dashboard"],
      },
    })

    await user.click(
      await screen.findByRole("button", {
        name: new RegExp(userMock.displayName),
      }),
    )
    await user.click(await screen.findByText(t("appShell.signOut")))

    await waitFor(() => {
      expect(useAuthStore.getState()).toMatchObject({
        currentUser: null,
      })
      expect(router?.state.location.pathname).toBe("/login")
    })
  })
})
