import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { LoginHeroesProvider } from "@/pages/login/LoginHeroesContext"
import { RegisterForm } from "@/pages/login/RegisterForm"
import { renderWithProviders } from "@/test/render"

function t(key: string) {
  return i18n.t(key)
}

function renderRegisterForm() {
  return renderWithProviders(
    <LoginHeroesProvider>
      <RegisterForm />
    </LoginHeroesProvider>,
    { router: false },
  )
}

describe("RegisterForm", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("shows required errors and does not submit an empty form", async () => {
    const user = userEvent.setup()
    renderRegisterForm()

    await user.click(screen.getByRole("button", { name: t("login.createAccount") }))

    expect(await screen.findByText(t("login.usernameRequired"))).toBeInTheDocument()
    expect(screen.getByText(t("login.passwordRequired"))).toBeInTheDocument()
    expect(screen.getByText(t("login.confirmPasswordRequired"))).toBeInTheDocument()
  })

  it("requires matching passwords", async () => {
    const user = userEvent.setup()
    renderRegisterForm()

    await user.type(screen.getByLabelText(t("login.username")), "eleno")
    await user.type(screen.getByLabelText(t("login.password")), "secret")
    await user.type(screen.getByLabelText(t("login.confirmPassword")), "different")
    await user.click(screen.getByRole("button", { name: t("login.createAccount") }))

    expect(await screen.findByText(t("login.confirmPasswordMismatch"))).toBeInTheDocument()
  })

  it("reports that registration needs a real auth API", async () => {
    const user = userEvent.setup()
    renderRegisterForm()

    await user.type(screen.getByLabelText(t("login.username")), "eleno")
    await user.type(screen.getByLabelText(t("login.password")), "secret")
    await user.type(screen.getByLabelText(t("login.confirmPassword")), "secret")
    await user.click(screen.getByRole("button", { name: t("login.createAccount") }))

    expect(await screen.findByText(t("login.registerUnavailableTitle"))).toBeInTheDocument()
    expect(screen.getByText(t("login.registerUnavailableDescription"))).toBeInTheDocument()
  })
})
