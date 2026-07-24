import { QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it } from "vitest"

import { AppRouter } from "@/app/router"
import { TooltipProvider } from "@/components/ui/tooltip"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { userMock } from "@/mocks/data/auth"
import { useAuthStore } from "@/stores/auth"
import { createTestQueryClient } from "@/test/query-client"
import { resetStores } from "@/test/stores"

function renderRouterAt(path: string) {
  window.history.pushState(null, "", path)

  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={createTestQueryClient()}>
        <TooltipProvider>
          <AppRouter />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  )
}

describe("app router auth redirects", () => {
  beforeEach(async () => {
    resetStores()
    await i18n.changeLanguage(defaultLanguage)
  })

  it("redirects the root route to login when signed out", async () => {
    renderRouterAt("/")

    await waitFor(() => {
      expect(window.location.pathname).toBe("/login")
    })
  })

  it("redirects app routes to login when signed out", async () => {
    renderRouterAt("/dashboard")

    await waitFor(() => {
      expect(window.location.pathname).toBe("/login")
    })
  })

  it("redirects login to dashboard when signed in", async () => {
    useAuthStore.getState().setCurrentUser(userMock)

    renderRouterAt("/login")

    await waitFor(() => {
      expect(window.location.pathname).toBe("/dashboard")
    })
  })

  it("renders the authenticated interview session route", async () => {
    useAuthStore.getState().setCurrentUser(userMock)

    renderRouterAt("/interview/session/mock-session")

    expect(
      await screen.findByRole("heading", {
        name: i18n.t("interview.session.title"),
        level: 1,
      }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/interview/session/mock-session")
    expect(screen.getByRole("link", { name: i18n.t("appShell.nav.interview") })).toHaveAttribute(
      "data-active",
    )
  })

  it("renders the authenticated interview review route", async () => {
    useAuthStore.getState().setCurrentUser(userMock)

    renderRouterAt("/interview/review/mock-session")

    expect(
      await screen.findByRole("heading", {
        name: i18n.t("interview.review.title"),
        level: 1,
      }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/interview/review/mock-session")
    expect(screen.getByRole("link", { name: i18n.t("appShell.nav.interview") })).toHaveAttribute(
      "data-active",
    )
  })
})
