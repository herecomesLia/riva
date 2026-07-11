import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { LoginPage } from "@/pages/login/LoginPage"
import { renderWithProviders } from "@/test/render"

const { useMediaMock } = vi.hoisted(() => ({ useMediaMock: vi.fn() }))

vi.mock("react-use", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-use")>()),
  useMedia: useMediaMock,
}))
vi.mock("@/pages/login/LoginForm", () => ({
  LoginForm: ({ onLoginSuccess }: { onLoginSuccess: () => void }) => (
    <button onClick={onLoginSuccess} type="button">
      Complete login
    </button>
  ),
}))
vi.mock("@/pages/login/LoginHeroes", () => ({
  LoginHeroes: () => <div data-testid="login-heroes" />,
}))

describe("LoginPage", () => {
  it("navigates to dashboard after the form reports a successful login", async () => {
    const user = userEvent.setup()
    useMediaMock.mockReturnValue(false)
    const { router } = renderWithProviders(<LoginPage />, {
      router: { initialEntries: ["/login"] },
    })

    await user.click(await screen.findByRole("button", { name: "Complete login" }))

    await waitFor(() => {
      expect(router?.state.location.pathname).toBe("/dashboard")
    })
  })

  it.each([
    {
      matchesDesktop: false,
      description: "does not mount LoginHeroes below the desktop breakpoint",
    },
    { matchesDesktop: true, description: "mounts LoginHeroes at the desktop breakpoint" },
  ])("$description", ({ matchesDesktop }) => {
    useMediaMock.mockReturnValue(matchesDesktop)

    renderWithProviders(<LoginPage />, { router: false })

    if (matchesDesktop) {
      expect(screen.getByTestId("login-heroes")).toBeInTheDocument()
    } else {
      expect(screen.queryByTestId("login-heroes")).not.toBeInTheDocument()
    }
  })
})
