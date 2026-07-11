import { useForm } from "@tanstack/react-form"
import type { TFunction } from "i18next"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/hooks/use-auth"
import { useLoginHeroesContext } from "@/pages/login/LoginHeroesContext"

type LoginFormProps = {
  onLoginSuccess: () => void
}
function createLoginSchema(t: TFunction) {
  return z.object({
    username: z
      .string()
      .min(1, t("login.usernameRequired"))
      .refine((value) => value === value.trim(), t("login.usernameNoOuterSpaces")),
    password: z.string().min(1, t("login.passwordRequired")),
  })
}

export function LoginForm({ onLoginSuccess }: LoginFormProps) {
  const { login } = useAuth()
  const { t } = useTranslation()
  const [, setHerosState] = useLoginHeroesContext()
  const [rememberSession, setRememberSession] = useState(false)

  function handleUsernameFocus() {
    setHerosState((state) => ({ ...state, isUsernameFocused: true }))
  }

  function handleUsernameBlur() {
    setHerosState((state) => ({ ...state, isUsernameFocused: false }))
  }

  function handlePasswordChange(password: string) {
    setHerosState((state) => ({ ...state, isPasswordEmpty: password.length === 0 }))
  }
  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
    validators: {
      onSubmit: createLoginSchema(t),
    },
    onSubmit: async ({ value }) => {
      await login({
        password: value.password,
        username: value.username,
      })
      onLoginSuccess()
    },
  })

  return (
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
                    handleUsernameBlur()
                    field.handleBlur()
                  }}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onFocus={handleUsernameFocus}
                  placeholder={t("login.usernamePlaceholder")}
                  type="text"
                  value={field.state.value}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
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
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="current-password"
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    handlePasswordChange(event.target.value)
                    field.handleChange(event.target.value)
                  }}
                  onPasswordVisibilityChange={(isPasswordVisible) => {
                    setHerosState((state) => ({ ...state, isPasswordVisible }))
                  }}
                  placeholder={t("login.passwordPlaceholder")}
                  type="password"
                  value={field.state.value}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        </form.Field>

        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <Field className="max-w-full items-center gap-2 sm:w-auto" orientation="horizontal">
            <Checkbox
              aria-label={t("login.remember")}
              checked={rememberSession}
              className="shrink-0"
              id="remember-session"
              onCheckedChange={(checked) => setRememberSession(checked === true)}
            />
            <FieldLabel
              className="min-w-0 cursor-pointer truncate font-normal"
              htmlFor="remember-session"
            >
              {t("login.remember")}
            </FieldLabel>
          </Field>
          <Button type="button" variant="link">
            {t("login.forgotPassword")}
          </Button>
        </div>
      </FieldGroup>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button className="h-12 w-full text-base" disabled={isSubmitting} size="lg" type="submit">
            {isSubmitting && <Spinner data-icon="inline-start" />}
            {isSubmitting ? t("login.signingIn") : t("login.continue")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
