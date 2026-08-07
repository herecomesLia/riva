import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { userMock } from "@/mocks/data/auth"
import { LoginHeroesProvider } from "@/pages/login/LoginHeroesContext"
import { RegisterForm } from "@/pages/login/RegisterForm"
import { ApiError } from "@/services/api"
import { renderWithProviders } from "@/test/render"

const registerMock = vi.hoisted(() => vi.fn())

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ register: registerMock }),
}))

function t(key: string) {
  return i18n.t(key)
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

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { confirmPassword = "Correct123!", password = "Correct123!", username = "new_user" } = {},
) {
  await user.type(screen.getByLabelText(t("login.username")), username)
  await user.type(screen.getByLabelText(t("login.password")), password)
  await user.type(screen.getByLabelText(t("login.confirmPassword")), confirmPassword)
}

describe("RegisterForm", () => {
  beforeEach(async () => {
    registerMock.mockReset()
    await i18n.changeLanguage(defaultLanguage)
  })

  it("submits only username and password and reports success", async () => {
    const user = userEvent.setup()
    const onRegisterSuccess = vi.fn()
    registerMock.mockResolvedValue(userMock)
    renderRegisterForm(onRegisterSuccess)
    await fillForm(user)

    await user.click(screen.getByRole("button", { name: t("login.createAccount") }))

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith({
        password: "Correct123!",
        username: "new_user",
      })
      expect(onRegisterSuccess).toHaveBeenCalledOnce()
    })
  })

  it.each([
    {
      error: new ApiError(409, "username_taken", { error: "username_taken" }),
      messageKey: "login.registerErrorUsernameTaken",
    },
    {
      error: new ApiError(422, "invalid_username", { error: "invalid_username" }),
      messageKey: "login.registerErrorInvalidUsername",
    },
    {
      error: new ApiError(422, "invalid_password", { error: "invalid_password" }),
      messageKey: "login.registerErrorInvalidPassword",
    },
    {
      error: new TypeError("fetch failed"),
      messageKey: "login.registerErrorServiceUnavailable",
    },
    {
      error: new Error("sensitive server detail"),
      messageKey: "login.registerErrorUnknown",
    },
  ])("maps registration failures to $messageKey", async ({ error, messageKey }) => {
    const user = userEvent.setup()
    registerMock.mockRejectedValue(error)
    renderRegisterForm()
    await fillForm(user)

    await user.click(screen.getByRole("button", { name: t("login.createAccount") }))

    expect(await screen.findByText(t("login.registerErrorTitle"))).toBeInTheDocument()
    expect(screen.getByText(t(messageKey))).toBeInTheDocument()
    expect(screen.queryByText("sensitive server detail")).not.toBeInTheDocument()
  })

  it.each([
    {
      expectedMessageKey: "login.usernameFormat",
      input: { username: "abc" },
      scenario: "a username shorter than four characters",
    },
    {
      expectedMessageKey: "login.usernameFormat",
      input: { username: "bad user" },
      scenario: "a username containing spaces",
    },
    {
      expectedMessageKey: "login.passwordFormat",
      input: { confirmPassword: "short", password: "short" },
      scenario: "a password shorter than eight characters",
    },
    {
      expectedMessageKey: "login.confirmPasswordMismatch",
      input: { confirmPassword: "Different123!" },
      scenario: "passwords that do not match",
    },
  ])("rejects $scenario", async ({ expectedMessageKey, input }) => {
    const user = userEvent.setup()
    renderRegisterForm()
    await fillForm(user, input)

    await user.click(screen.getByRole("button", { name: t("login.createAccount") }))

    expect(await screen.findByText(t(expectedMessageKey))).toBeInTheDocument()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it("disables the submit button while registration is pending", async () => {
    const user = userEvent.setup()
    let resolveRegistration!: (user: typeof userMock) => void
    registerMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRegistration = resolve
      }),
    )
    renderRegisterForm()
    await fillForm(user)

    const submitButton = screen.getByRole("button", { name: t("login.createAccount") })
    await user.click(submitButton)

    await waitFor(() => expect(submitButton).toBeDisabled())

    resolveRegistration(userMock)
    await waitFor(() => expect(submitButton).not.toBeDisabled())
  })
})
