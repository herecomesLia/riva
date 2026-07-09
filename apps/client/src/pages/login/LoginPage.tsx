import { useForm } from "@tanstack/react-form"
import { useNavigate } from "@tanstack/react-router"
import { EyeIcon, EyeOffIcon, SparklesIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { LanguageSwitcher } from "@/components/common/LanguageSwitcher"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/use-auth"
import { LoginCharacters } from "@/pages/login/LoginCharacters"

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { t } = useTranslation()
  const [showPassword, setShowPassword] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [passwordValue, setPasswordValue] = useState("")
  const [rememberSession, setRememberSession] = useState(false)
  const formSchema = z.object({
    username: z
      .string()
      .min(1, t("login.usernameRequired"))
      .refine((value) => value === value.trim(), t("login.usernameNoOuterSpaces")),
    password: z.string().min(1, t("login.passwordRequired")),
  })
  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      await login({
        password: value.password,
        username: value.username,
      })
      void navigate({ to: "/dashboard" })
    },
  })

  return (
    <main className="grid min-h-dvh bg-background text-foreground lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-primary/10 p-12 text-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="relative flex items-center gap-3 text-lg font-semibold">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-foreground">
            <SparklesIcon aria-hidden className="size-4" />
          </div>
          <span>{t("login.brand")}</span>
        </div>

        <div className="relative flex h-[500px] items-end justify-center">
          <LoginCharacters
            isTyping={isTyping}
            password={passwordValue}
            showPassword={showPassword}
          />
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

      <section className="flex items-center justify-center bg-background p-8">
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

          <form
            className="flex flex-col gap-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <FieldGroup className="gap-5">
              <form.Field name="username">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>{t("login.username")}</FieldLabel>
                      <Input
                        aria-invalid={isInvalid}
                        autoComplete="username"
                        id={field.name}
                        name={field.name}
                        onBlur={() => {
                          setIsTyping(false)
                          field.handleBlur()
                        }}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onFocus={() => setIsTyping(true)}
                        placeholder={t("login.usernamePlaceholder")}
                        type="text"
                        value={field.state.value}
                      />
                      {isInvalid && <FieldError className="text-red-500" errors={field.state.meta.errors} />}
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="password">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>{t("login.password")}</FieldLabel>
                      <InputGroup className="h-12">
                        <InputGroupInput
                          aria-invalid={isInvalid}
                          autoComplete="current-password"
                          id={field.name}
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) => {
                            setPasswordValue(event.target.value)
                            field.handleChange(event.target.value)
                          }}
                          placeholder={t("login.passwordPlaceholder")}
                          type={showPassword ? "text" : "password"}
                          value={field.state.value}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                            onClick={() => setShowPassword((current) => !current)}
                            size="icon-sm"
                          >
                            {showPassword ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
                          </InputGroupButton>
                        </InputGroupAddon>
                      </InputGroup>
                      {isInvalid && <FieldError className="text-red-500" errors={field.state.meta.errors} />}
                    </Field>
                  )
                }}
              </form.Field>

              <div className="flex items-center justify-between gap-4">
                <Field className="w-44 shrink-0 items-center gap-2" orientation="horizontal">
                  <Checkbox
                    aria-label={t("login.remember")}
                    checked={rememberSession}
                    className="shrink-0"
                    id="remember-session"
                    onCheckedChange={(checked) => setRememberSession(checked === true)}
                  />
                  <FieldLabel className="min-w-0 cursor-pointer truncate font-normal" htmlFor="remember-session">
                    {t("login.remember")}
                  </FieldLabel>
                </Field>
                <Button type="button" variant="link">
                  {t("login.forgotPassword")}
                </Button>
              </div>
            </FieldGroup>

            <Button className="h-12 w-full text-base" disabled={form.state.isSubmitting} size="lg" type="submit">
              {form.state.isSubmitting && <Spinner data-icon="inline-start" />}
              {form.state.isSubmitting ? t("login.signingIn") : t("login.continue")}
            </Button>
          </form>

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
