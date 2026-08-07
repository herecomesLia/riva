import { Link, useNavigate } from "@tanstack/react-router"
import { SparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useMedia } from "react-use"

import { LanguageSwitcher } from "@/components/common/LanguageSwitcher"
import { ThemeSwitcher } from "@/components/common/ThemeSwitcher"
import { LoginForm } from "@/pages/login/LoginForm"
import { LoginHeroes } from "@/pages/login/LoginHeroes"
import { LoginHeroesProvider } from "@/pages/login/LoginHeroesContext"
import { RegisterForm } from "@/pages/login/RegisterForm"

type LoginPageMode = "login" | "register"

export function LoginPage({ mode = "login" }: { mode?: LoginPageMode }) {
  const shouldRenderHeroes = useMedia("(min-width: 64rem)")

  const navigate = useNavigate()
  const { t } = useTranslation()
  const isRegisterMode = mode === "register"

  function handleAuthSuccess() {
    void navigate({ to: "/dashboard" })
  }

  return (
    <LoginHeroesProvider>
      <main className="grid min-h-dvh bg-background text-foreground lg:grid-cols-2">
        <section className="relative hidden overflow-hidden bg-primary/10 p-12 text-foreground lg:flex lg:flex-col lg:gap-5">
          <div className="relative flex items-center gap-3 text-lg font-semibold">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-foreground">
              <SparklesIcon aria-hidden className="size-4" />
            </div>
            <span>{t("login.brand")}</span>
          </div>

          <div className="relative flex flex-1 items-end justify-center">
            {shouldRenderHeroes && <LoginHeroes className="w-full max-w-[550px]" />}
          </div>

          <div className="relative flex items-center gap-8 text-sm text-muted-foreground">
            <a className="transition-colors hover:text-foreground" href="#privacy">
              {t("login.privacy")}
            </a>
            <a className="transition-colors hover:text-foreground" href="#terms">
              {t("login.terms")}
            </a>
            <a className="transition-colors hover:text-foreground" href="#contact">
              {t("login.contact")}
            </a>
          </div>
        </section>

        <section className="flex min-h-dvh flex-col gap-8 bg-background px-4 py-8 sm:p-8 lg:p-12">
          <div className="flex items-center justify-between lg:justify-end">
            <div className="flex items-center gap-3 text-lg font-semibold lg:hidden">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <SparklesIcon aria-hidden className="size-4 text-foreground" />
              </div>
              <span>{t("login.brand")}</span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeSwitcher />
              <LanguageSwitcher />
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <div className="flex w-full max-w-[420px] flex-col gap-8">
              <div className="flex flex-col gap-2 text-center">
                <h1 className="text-3xl font-bold tracking-normal">
                  {isRegisterMode ? t("login.registerTitle") : t("login.title")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isRegisterMode ? t("login.registerDescription") : t("login.description")}
                </p>
              </div>
              {isRegisterMode ? (
                <RegisterForm onRegisterSuccess={handleAuthSuccess} />
              ) : (
                <LoginForm onLoginSuccess={handleAuthSuccess} />
              )}
              {isRegisterMode ? (
                <p className="text-center text-sm text-muted-foreground">
                  {t("login.hasAccount")}{" "}
                  <Link className="text-primary underline-offset-4 hover:underline" to="/login">
                    {t("login.signIn")}
                  </Link>
                </p>
              ) : (
                <p className="text-center text-sm text-muted-foreground">
                  {t("login.noAccount")}{" "}
                  <Link className="text-primary underline-offset-4 hover:underline" to="/register">
                    {t("login.signUp")}
                  </Link>
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
    </LoginHeroesProvider>
  )
}
