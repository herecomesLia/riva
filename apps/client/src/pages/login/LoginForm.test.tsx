import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { LoginForm } from "@/pages/login/LoginForm"
import {
  LoginHeroesProvider,
  useLoginHeroesContext,
} from "@/pages/login/LoginHeroesContext"
import { renderWithProviders } from "@/test/render"

const { loginMock } = vi.hoisted(() => ({ loginMock: vi.fn() }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ login: loginMock }),
}))

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

function renderLoginForm(onLoginSuccess = vi.fn()) {
  return {
    onLoginSuccess,
    ...renderWithProviders(
      <LoginHeroesProvider>
        <LoginForm onLoginSuccess={onLoginSuccess} />
      </LoginHeroesProvider>,
      { router: false },
    ),
  }
}

describe("LoginForm", () => {
  beforeEach(() => {
    loginMock.mockReset()
  })

  it("shows required errors and does not submit an empty form", async () => {
    const user = userEvent.setup()
    const { onLoginSuccess } = renderLoginForm()

    await user.click(screen.getByRole("button", { name: t("login.continue") }))

    expect(await screen.findByText(t("login.usernameRequired"))).toBeInTheDocument()
    expect(screen.getByText(t("login.passwordRequired"))).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
    expect(onLoginSuccess).not.toHaveBeenCalled()
  })

  it("rejects a username with outer spaces", async () => {
    const user = userEvent.setup()
    renderLoginForm()

    await user.type(screen.getByLabelText(t("login.username")), " eleno")
    await user.type(screen.getByLabelText(t("login.password")), "secret")
    await user.click(screen.getByRole("button", { name: t("login.continue") }))

    expect(await screen.findByText(t("login.usernameNoOuterSpaces"))).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it("submits credentials and reports success after login resolves", async () => {
    const user = userEvent.setup()
    const deferred = createDeferred<unknown>()
    loginMock.mockReturnValue(deferred.promise)
    const { onLoginSuccess } = renderLoginForm()

    await user.type(screen.getByLabelText(t("login.username")), "eleno")
    await user.type(screen.getByLabelText(t("login.password")), "secret")
    await user.click(screen.getByRole("button", { name: t("login.continue") }))

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

    renderWithProviders(
      <LoginHeroesProvider>
        <LoginForm onLoginSuccess={vi.fn()} />
        <HeroesStateProbe />
      </LoginHeroesProvider>,
      { router: false },
    )

    const username = screen.getByLabelText(t("login.username"))
    await user.click(username)
    expect(JSON.parse(screen.getByTestId("heroes-state").textContent ?? "")).toMatchObject({
      isUsernameFocused: true,
    })

    await user.tab()
    expect(JSON.parse(screen.getByTestId("heroes-state").textContent ?? "")).toMatchObject({
      isUsernameFocused: false,
    })

    await user.type(screen.getByLabelText(t("login.password")), "secret")
    expect(JSON.parse(screen.getByTestId("heroes-state").textContent ?? "")).toMatchObject({
      isPasswordEmpty: false,
    })

    await user.click(screen.getByRole("button", { name: "Show password" }))
    expect(JSON.parse(screen.getByTestId("heroes-state").textContent ?? "")).toMatchObject({
      isPasswordVisible: true,
    })
  })
})
