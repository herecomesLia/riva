import { useForm } from "@tanstack/react-form"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Field, FieldControl, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
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
      className="flex flex-col gap-10"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field name="username">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>{t("login.username")}</FieldLabel>
                <FieldControl>
                  <Input
                    id={field.name}
                    name={field.name}
                    autoComplete="username"
                    placeholder={t("login.usernamePlaceholder")}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </FieldControl>
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="password">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field invalid={isInvalid}>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor={field.name}>{t("login.password")}</FieldLabel>
                  <a className="text-sm text-primary underline-offset-4 hover:underline" href="#">
                    {t("login.forgotPassword")}
                  </a>
                </div>
                <FieldControl>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    autoComplete="current-password"
                    placeholder={t("login.passwordPlaceholder")}
                    value={field.state.value}
                    onFocus={handleUsernameFocus}
                    onBlur={() => {
                      handleUsernameBlur()
                      field.handleBlur()
                    }}
                    onChange={(event) => {
                      const password = event.target.value
                      handlePasswordChange(password)
                      field.handleChange(password)
                    }}
                    onPasswordVisibilityChange={(isPasswordVisible) => {
                      setHerosState((state) => ({
                        ...state,
                        isPasswordVisible,
                      }))
                    }}
                  />
                </FieldControl>
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )
          }}
        </form.Field>
      </FieldGroup>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
            {isSubmitting && <Spinner data-icon="inline-start" />}
            {isSubmitting ? t("login.signingIn") : t("login.continue")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
