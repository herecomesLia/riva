import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, TransportError } from "@/api/error"
import { useAuth } from "@/hooks/use-auth"
import { i18n } from "@/i18n/i18n"
import { LoginForm } from "@/pages/login/LoginForm"
import { LoginHeroesProvider, useLoginHeroesContext } from "@/pages/login/LoginHeroesContext"
import { renderWithProviders } from "@/test/render"

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}))

const loginMock = vi.fn()

function apiError(status: number, code: string, message: string) {
  return new ApiError(
    status,
    {
      error: { code, message },
      requestId: "request-1",
    },
    "Request failed",
  )
}

function invalidCredentialsError() {
  return apiError(401, "auth.invalid_credentials", "Invalid username or password.")
}

function t(key: string) {
  return i18n.t(key)
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

function HeroesStateProbe() {
  const [state] = useLoginHeroesContext()

  return <output data-testid="heroes-state">{JSON.stringify(state)}</output>
}

function renderLoginForm(onLoginSuccess = vi.fn(), withHeroesStateProbe = false) {
  return {
    onLoginSuccess,
    ...renderWithProviders(
      <LoginHeroesProvider>
        <LoginForm onLoginSuccess={onLoginSuccess} />
        {withHeroesStateProbe && <HeroesStateProbe />}
      </LoginHeroesProvider>,
      { router: false },
    ),
  }
}

async function fillLoginForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(t("login.username")), "eleno")
  await user.type(screen.getByLabelText(t("login.password")), "secret")
}

function getSubmitButton() {
  return screen.getByRole("button", { name: t("login.continue") })
}

function getPasswordInput() {
  return screen.getByLabelText(t("login.password"))
}

describe("LoginForm", () => {
  beforeEach(() => {
    loginMock.mockReset()
    vi.mocked(useAuth).mockReturnValue({
      currentUser: null,
      isAuthenticated: false,
      login: loginMock,
      logout: vi.fn(),
      restoreCurrentUser: vi.fn(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows required errors and does not submit an empty form", async () => {
    const user = userEvent.setup()
    const { onLoginSuccess } = renderLoginForm()

    await user.click(getSubmitButton())

    expect(await screen.findByText(t("login.usernameRequired"))).toBeInTheDocument()
    expect(screen.getByText(t("login.passwordRequired"))).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
    expect(onLoginSuccess).not.toHaveBeenCalled()
  })

  it("rejects a username with outer spaces", async () => {
    const user = userEvent.setup()
    renderLoginForm()

    await user.type(screen.getByLabelText(t("login.username")), " eleno")
    await user.type(getPasswordInput(), "secret")
    await user.click(getSubmitButton())

    expect(await screen.findByText(t("login.usernameNoOuterSpaces"))).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it("submits credentials and reports success after login resolves", async () => {
    const user = userEvent.setup()
    const deferred = createDeferred<unknown>()
    loginMock.mockReturnValue(deferred.promise)
    const { onLoginSuccess } = renderLoginForm()

    await fillLoginForm(user)
    await user.click(getSubmitButton())

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({ username: "eleno", password: "secret" })
    })
    const submittingButton = screen.getByRole("button", {
      name: new RegExp(t("login.signingIn")),
    })
    expect(submittingButton).toBeDisabled()
    expect(onLoginSuccess).not.toHaveBeenCalled()

    await act(async () => {
      deferred.resolve(undefined)
    })

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledTimes(1)
    })
  })

  it("synchronizes form interactions with the login heroes state", async () => {
    const user = userEvent.setup()
    renderLoginForm(vi.fn(), true)

    const username = screen.getByLabelText(t("login.username"))
    await user.click(username)
    expect(JSON.parse(screen.getByTestId("heroes-state").textContent ?? "")).toMatchObject({
      isUsernameFocused: true,
    })

    await user.tab()
    expect(JSON.parse(screen.getByTestId("heroes-state").textContent ?? "")).toMatchObject({
      isUsernameFocused: false,
    })

    await user.type(getPasswordInput(), "secret")
    expect(JSON.parse(screen.getByTestId("heroes-state").textContent ?? "")).toMatchObject({
      isPasswordEmpty: false,
    })

    await user.click(screen.getByRole("button", { name: "Show password" }))
    expect(JSON.parse(screen.getByTestId("heroes-state").textContent ?? "")).toMatchObject({
      isPasswordVisible: true,
    })
  })

  it("handles invalid credentials without field-level server errors", async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(invalidCredentialsError())
    const { onLoginSuccess } = renderLoginForm()

    await fillLoginForm(user)
    await user.click(getSubmitButton())

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(t("login.errorInvalidCredentials"))
    expect(onLoginSuccess).not.toHaveBeenCalled()
    expect(screen.getByLabelText(t("login.username"))).toHaveValue("eleno")
    expect(getPasswordInput()).toHaveValue("")
    expect(getPasswordInput()).toHaveFocus()
    expect(getSubmitButton()).toBeEnabled()
  })

  it("keeps credentials for a service unavailable error", async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(
      apiError(503, "dependency.database_unavailable", "Database is temporarily unavailable."),
    )
    const { onLoginSuccess } = renderLoginForm()

    await fillLoginForm(user)
    await user.click(getSubmitButton())

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(t("login.errorServiceUnavailable"))
    expect(screen.getByLabelText(t("login.username"))).toHaveValue("eleno")
    expect(getPasswordInput()).toHaveValue("secret")
    expect(onLoginSuccess).not.toHaveBeenCalled()
    expect(getSubmitButton()).toBeEnabled()
  })

  it("treats transport failures as service unavailable", async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(new TransportError("network", "Network unavailable"))
    renderLoginForm()

    await fillLoginForm(user)
    await user.click(getSubmitButton())

    expect(await screen.findByRole("alert")).toHaveTextContent(t("login.errorServiceUnavailable"))
    expect(screen.getByLabelText(t("login.username"))).toHaveValue("eleno")
    expect(getPasswordInput()).toHaveValue("secret")
  })

  it("shows a safe fallback for unknown errors", async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(new Error("database password leaked"))
    const { onLoginSuccess } = renderLoginForm()

    await fillLoginForm(user)
    await user.click(getSubmitButton())

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(t("login.errorUnknown"))
    expect(alert).not.toHaveTextContent("database password leaked")
    expect(screen.getByLabelText(t("login.username"))).toHaveValue("eleno")
    expect(getPasswordInput()).toHaveValue("secret")
    expect(onLoginSuccess).not.toHaveBeenCalled()
    expect(getSubmitButton()).toBeEnabled()
  })

  it("clears the form-level error when the username changes", async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(new TransportError("network", "Network unavailable"))
    renderLoginForm()

    await fillLoginForm(user)
    await user.click(getSubmitButton())
    expect(await screen.findByRole("alert")).toHaveTextContent(t("login.errorServiceUnavailable"))

    await user.type(screen.getByLabelText(t("login.username")), "x")

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("automatically hides the login error popup after a short duration", async () => {
    loginMock.mockRejectedValue(invalidCredentialsError())
    renderWithProviders(
      <LoginHeroesProvider>
        <LoginForm loginErrorVisibleMs={1} onLoginSuccess={vi.fn()} />
      </LoginHeroesProvider>,
      { router: false },
    )

    fireEvent.change(screen.getByLabelText(t("login.username")), { target: { value: "eleno" } })
    fireEvent.change(getPasswordInput(), { target: { value: "secret" } })
    fireEvent.click(getSubmitButton())

    expect(await screen.findByRole("alert")).toHaveTextContent(t("login.errorInvalidCredentials"))

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })
  })

  it("clears the form-level error when the password changes", async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(new TransportError("network", "Network unavailable"))
    renderLoginForm()

    await fillLoginForm(user)
    await user.click(getSubmitButton())
    expect(await screen.findByRole("alert")).toHaveTextContent(t("login.errorServiceUnavailable"))

    await user.type(getPasswordInput(), "x")

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("can submit again after a failed login and only reports success once", async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValueOnce(invalidCredentialsError()).mockResolvedValueOnce(undefined)
    const { onLoginSuccess } = renderLoginForm()

    await fillLoginForm(user)
    await user.click(getSubmitButton())
    expect(await screen.findByRole("alert")).toHaveTextContent(t("login.errorInvalidCredentials"))

    await user.type(getPasswordInput(), "secret")
    await user.click(getSubmitButton())

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(2)
    })
    expect(loginMock).toHaveBeenLastCalledWith({ username: "eleno", password: "secret" })

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledTimes(1)
    })
  })

  it("resets the login heroes password state after invalid credentials clear the password", async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(invalidCredentialsError())
    renderLoginForm(vi.fn(), true)

    await fillLoginForm(user)
    expect(JSON.parse(screen.getByTestId("heroes-state").textContent ?? "")).toMatchObject({
      isPasswordEmpty: false,
    })

    await user.click(getSubmitButton())

    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("heroes-state").textContent ?? "")).toMatchObject({
        isPasswordEmpty: true,
      })
    })
  })
})
