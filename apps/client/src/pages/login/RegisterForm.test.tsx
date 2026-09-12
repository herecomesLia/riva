import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, TransportError } from "@/api/error"
import type { ErrorCode } from "@/api/generated/models"
import { useAuth } from "@/hooks/use-auth"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { LoginHeroesProvider } from "@/pages/login/LoginHeroesContext"
import { RegisterForm } from "@/pages/login/RegisterForm"
import { renderWithProviders } from "@/test/render"

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}))

const registerMock = vi.fn()
const validCredentials = {
  password: "ValidPass123!",
  username: "NewUser",
}

function t(key: string) {
  return i18n.t(key)
}

function apiError(code: ErrorCode, message: string) {
  return new ApiError({ error: { code, message, issues: [] } })
}

function renderRegisterForm(onRegisterSuccess = vi.fn()) {
  return {
    onRegisterSuccess,
    ...renderWithProviders(
      <LoginHeroesProvider>
        <RegisterForm onRegisterSuccess={onRegisterSuccess} />
      </LoginHeroesProvider>,
      { router: false },
    ),
  }
}

function fillRegisterForm(
  username: string = validCredentials.username,
  password: string = validCredentials.password,
  confirmPassword: string = password,
) {
  fireEvent.change(screen.getByLabelText(t("login.username")), { target: { value: username } })
  fireEvent.change(screen.getByLabelText(t("login.password")), { target: { value: password } })
  fireEvent.change(screen.getByLabelText(t("login.confirmPassword")), {
    target: { value: confirmPassword },
  })
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: t("login.createAccount") }))
}

describe("RegisterForm", () => {
  beforeEach(async () => {
    registerMock.mockReset()
    vi.mocked(useAuth, { partial: true }).mockReturnValue({
      currentUser: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      register: registerMock,
    })
    await i18n.changeLanguage(defaultLanguage)
  })

  it("shows required errors and does not submit an empty form", async () => {
    renderRegisterForm()

    submit()

    expect(await screen.findByText(t("login.usernameRequired"))).toBeInTheDocument()
    expect(screen.getByText(t("login.passwordRequired"))).toBeInTheDocument()
    expect(screen.getByText(t("login.confirmPasswordRequired"))).toBeInTheDocument()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it("requires matching passwords", async () => {
    renderRegisterForm()
    fillRegisterForm(validCredentials.username, validCredentials.password, "DifferentPass123!")

    submit()

    expect(await screen.findByText(t("login.confirmPasswordMismatch"))).toBeInTheDocument()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it.each([
    ["abc", validCredentials.password, "login.registerUsernameTooShort"],
    ["a".repeat(33), validCredentials.password, "login.registerUsernameTooLong"],
    ["bad user", validCredentials.password, "login.registerUsernameInvalid"],
    [validCredentials.username, "Short1!", "login.registerPasswordTooShort"],
    [validCredentials.username, "A".repeat(129), "login.registerPasswordTooLong"],
    [validCredentials.username, "Invalid 密码1!", "login.registerPasswordInvalid"],
  ])("enforces the server registration constraints", async (username, password, messageKey) => {
    renderRegisterForm()
    fillRegisterForm(username, password)

    submit()

    expect(await screen.findByText(t(messageKey))).toBeInTheDocument()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it("submits only the API credentials and reports success", async () => {
    const user = userEvent.setup()
    registerMock.mockResolvedValue({
      avatarUrl: null,
      displayName: validCredentials.username,
      id: "00000000-0000-4000-8000-000000000001",
      username: validCredentials.username,
    })
    const { onRegisterSuccess } = renderRegisterForm()
    fillRegisterForm()

    await user.click(screen.getByRole("button", { name: t("login.createAccount") }))

    await waitFor(() => expect(registerMock).toHaveBeenCalledWith(validCredentials))
    expect(onRegisterSuccess).toHaveBeenCalledOnce()
  })

  it("shows a username-taken error without exposing the server message", async () => {
    registerMock.mockRejectedValue(
      apiError("auth.username_taken", "Sensitive duplicate-account detail"),
    )
    renderRegisterForm()
    fillRegisterForm()

    submit()

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(t("login.registerErrorUsernameTaken"))
    expect(alert).not.toHaveTextContent("Sensitive duplicate-account detail")
  })

  it("clears a previous registration error when the username changes", async () => {
    registerMock.mockRejectedValue(
      apiError("auth.username_taken", "Username is already registered."),
    )
    renderRegisterForm()
    fillRegisterForm()
    submit()
    expect(await screen.findByRole("alert")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(t("login.username")), {
      target: { value: "AnotherUser" },
    })

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it.each([
    apiError("dependency.database_unavailable", "Database unavailable"),
    new TransportError("network", "Network unavailable"),
  ])("shows service unavailable for request availability failures", async (error) => {
    registerMock.mockRejectedValue(error)
    renderRegisterForm()
    fillRegisterForm()

    submit()

    expect(await screen.findByRole("alert")).toHaveTextContent(
      t("login.registerErrorServiceUnavailable"),
    )
  })

  it("shows a safe fallback for unknown errors", async () => {
    registerMock.mockRejectedValue(new Error("database password leaked"))
    renderRegisterForm()
    fillRegisterForm()

    submit()

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(t("login.registerErrorUnknown"))
    expect(alert).not.toHaveTextContent("database password leaked")
  })
})
