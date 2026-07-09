import { useNavigate } from "@tanstack/react-router"
import { SparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { LanguageSwitcher } from "@/components/common/LanguageSwitcher"
import { Button } from "@/components/ui/button"
import { LoginCharacters } from "@/pages/login/LoginCharacters"
import { LoginForm } from "@/pages/login/LoginForm"
import { useLoginCharactersState } from "@/pages/login/useLoginCharactersState"

export function LoginPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { charactersProps, formProps } = useLoginCharactersState()

  function handleLoginSuccess() {
    void navigate({ to: "/dashboard" })
  }

  return (
    <main className="grid min-h-dvh bg-background text-foreground lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-primary/10 p-12 text-foreground lg:flex lg:flex-col lg:gap-5">
        <div className="relative flex items-center gap-3 text-lg font-semibold">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-foreground">
            <SparklesIcon aria-hidden className="size-4" />
          </div>
          <span>{t("login.brand")}</span>
        </div>

        <div className="relative flex flex-1 items-end justify-center">
          <LoginCharacters className="w-full max-w-[550px]" {...charactersProps} />
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

      <section className="flex items-center justify-center bg-background px-4 py-8 sm:p-8">
        <div className="flex w-full max-w-[420px] flex-col gap-10">
          <div className="flex items-center justify-between lg:justify-end">
            <div className="flex items-center gap-3 text-lg font-semibold lg:hidden">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <SparklesIcon aria-hidden className="size-4 text-foreground" />
              </div>
              <span>{t("login.brand")}</span>
            </div>
            <LanguageSwitcher />
          </div>

          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-3xl font-bold tracking-normal">{t("login.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("login.description")}</p>
          </div>

          <LoginForm onLoginSuccess={handleLoginSuccess} {...formProps} />

          <div className="flex flex-col gap-6">
            <p className="text-center text-sm text-muted-foreground">
              {t("login.noAccount")}{" "}
              <Button className="h-auto p-0" type="button" variant="link">
                {t("login.signUp")}
              </Button>
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
