import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppShell } from "@/components/layout/AppShell"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { authUserFixture } from "@/mocks/fixtures/auth"
import { CURRENT_USER_QUERY_KEY } from "@/hooks/use-auth"
import { createTestQueryClient } from "@/test/query-client"
import { renderWithProviders } from "@/test/render"
import { resetStores } from "@/test/stores"

const userMock = authUserFixture

vi.mock("@/services/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/auth")>()),
  logout: vi.fn(),
  getCurrentUser: vi.fn(async () => null),
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

  it("resizes the sidebar within bounds and preserves its width across collapse", async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(<AppShell />, {
      router: { initialEntries: ["/dashboard"] },
    })
    const rail = await screen.findByRole("separator", { name: t("common.sidebar.resize") })
    rail.focus()
    await user.keyboard("{End}{ArrowRight}")
    expect(rail).toHaveAttribute("aria-valuenow", "22")
    await user.keyboard("{Home}{ArrowLeft}")
    expect(rail).toHaveAttribute("aria-valuenow", "12")
    await user.keyboard("{ArrowRight}{ArrowRight}")
    expect(container.querySelector('[data-slot="sidebar-wrapper"]')).toHaveStyle({
      "--sidebar-width": "14rem",
    })
    await user.keyboard("{Control>}b{/Control}")
    await user.click(screen.getByRole("button", { name: t("common.sidebar.toggle") }))
    expect(screen.getByRole("separator", { name: t("common.sidebar.resize") })).toHaveAttribute(
      "aria-valuenow",
      "14",
    )
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

  it("clears the current-user query and navigates to login after sign out", async () => {
    const user = userEvent.setup()
    const { logout } = await import("@/services/auth")
    vi.mocked(logout).mockResolvedValue()
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(CURRENT_USER_QUERY_KEY, userMock)
    const { router } = renderWithProviders(<AppShell />, {
      queryClient,
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
      expect(queryClient.getQueryData(CURRENT_USER_QUERY_KEY)).toBeNull()
      expect(router?.state.location.pathname).toBe("/login")
    })
  })
})
