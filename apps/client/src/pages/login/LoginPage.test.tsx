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
vi.mock("@/pages/login/RegisterForm", () => ({
  RegisterForm: () => <form aria-label="Register form" />,
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
  ])("$description", async ({ matchesDesktop }) => {
    useMediaMock.mockReturnValue(matchesDesktop)

    renderWithProviders(<LoginPage />, { router: { initialEntries: ["/login"] } })

    if (matchesDesktop) {
      expect(await screen.findByTestId("login-heroes")).toBeInTheDocument()
    } else {
      expect(await screen.findByRole("heading", { name: "欢迎回来！" })).toBeInTheDocument()
      expect(screen.queryByTestId("login-heroes")).not.toBeInTheDocument()
    }
  })

  it("renders the register form inside the shared login page layout", async () => {
    useMediaMock.mockReturnValue(false)

    renderWithProviders(<LoginPage mode="register" />, {
      router: { initialEntries: ["/register"] },
    })

    expect(await screen.findByRole("heading", { name: "创建 Riva 账号" })).toBeInTheDocument()
    expect(screen.getByRole("form", { name: "Register form" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Complete login" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute("href", "/login")
  })
})
