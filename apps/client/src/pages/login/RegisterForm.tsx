import { useForm } from "@tanstack/react-form"
import type { TFunction } from "i18next"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldControl, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useLoginHeroesContext } from "@/pages/login/LoginHeroesContext"

function createRegisterSchema(t: TFunction) {
  return z
    .object({
      confirmPassword: z.string().min(1, t("login.confirmPasswordRequired")),
      password: z.string().min(1, t("login.passwordRequired")),
      username: z
        .string()
        .min(1, t("login.usernameRequired"))
        .refine((value) => value === value.trim(), t("login.usernameNoOuterSpaces")),
    })
    .refine((value) => value.password === value.confirmPassword, {
      message: t("login.confirmPasswordMismatch"),
      path: ["confirmPassword"],
    })
}

export function RegisterForm() {
  const { t } = useTranslation()
  const [, setHerosState] = useLoginHeroesContext()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: {
      confirmPassword: "",
      password: "",
      username: "",
    },
    validators: {
      onSubmit: createRegisterSchema(t),
    },
    onSubmit: () => {
      setSubmitError(t("login.registerUnavailableDescription"))
    },
  })

  function handleUsernameFocus() {
    setHerosState((state) => ({ ...state, isUsernameFocused: true }))
  }

  function handleUsernameBlur() {
    setHerosState((state) => ({ ...state, isUsernameFocused: false }))
  }

  function handlePasswordChange(password: string) {
    setHerosState((state) => ({ ...state, isPasswordEmpty: password.length === 0 }))
  }

  return (
    <form
      className="flex flex-col gap-8"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setSubmitError(null)
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
                    value={field.state.value}
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
                <FieldLabel htmlFor={field.name}>{t("login.password")}</FieldLabel>
                <FieldControl>
                  <Input
                    autoComplete="new-password"
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
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
                    placeholder={t("login.passwordPlaceholder")}
                    type="password"
                    value={field.state.value}
                  />
                </FieldControl>
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="confirmPassword">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>{t("login.confirmPassword")}</FieldLabel>
                <FieldControl>
                  <Input
                    autoComplete="new-password"
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("login.confirmPasswordPlaceholder")}
                    type="password"
                    value={field.state.value}
                  />
                </FieldControl>
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )
          }}
        </form.Field>
      </FieldGroup>

      {submitError && (
        <Alert variant="destructive">
          <AlertTitle>{t("login.registerUnavailableTitle")}</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
            {isSubmitting && <Spinner data-icon="inline-start" />}
            {isSubmitting ? t("login.creatingAccount") : t("login.createAccount")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
