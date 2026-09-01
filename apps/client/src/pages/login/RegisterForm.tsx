import { useForm } from "@tanstack/react-form"
import type { TFunction } from "i18next"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { ApiError, TransportError } from "@/api/error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldControl, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/hooks/use-auth"
import { useLoginHeroesContext } from "@/pages/login/LoginHeroesContext"

type RegisterErrorCode = "usernameTaken" | "serviceUnavailable" | "unknown"

type RegisterFormProps = {
  onRegisterSuccess: () => void
}

const registrationUsernamePattern = /^[A-Za-z0-9_-]+$/
const registrationPasswordPattern = /^[A-Za-z0-9!@#$%^&*()_\-+=[\]{}|\\:;"'<>?,./~\x60]+$/

function createRegisterSchema(t: TFunction) {
  return z
    .object({
      confirmPassword: z.string().min(1, t("login.confirmPasswordRequired")),
      password: z.string().superRefine((value, context) => {
        if (value.length === 0) {
          context.addIssue({ code: "custom", message: t("login.passwordRequired") })
        } else if (value.length < 8) {
          context.addIssue({ code: "custom", message: t("login.registerPasswordTooShort") })
        } else if (value.length > 128) {
          context.addIssue({ code: "custom", message: t("login.registerPasswordTooLong") })
        } else if (!registrationPasswordPattern.test(value)) {
          context.addIssue({ code: "custom", message: t("login.registerPasswordInvalid") })
        }
      }),
      username: z.string().superRefine((value, context) => {
        if (value.length === 0) {
          context.addIssue({ code: "custom", message: t("login.usernameRequired") })
        } else if (value.length < 4) {
          context.addIssue({ code: "custom", message: t("login.registerUsernameTooShort") })
        } else if (value.length > 32) {
          context.addIssue({ code: "custom", message: t("login.registerUsernameTooLong") })
        } else if (!registrationUsernamePattern.test(value)) {
          context.addIssue({ code: "custom", message: t("login.registerUsernameInvalid") })
        }
      }),
    })
    .refine((value) => value.password === value.confirmPassword, {
      message: t("login.confirmPasswordMismatch"),
      path: ["confirmPassword"],
    })
}

export function RegisterForm({ onRegisterSuccess }: RegisterFormProps) {
  const { register } = useAuth()
  const { t } = useTranslation()
  const [, setHerosState] = useLoginHeroesContext()
  const [submitErrorCode, setSubmitErrorCode] = useState<RegisterErrorCode | null>(null)
  const submitErrorMessageKey =
    submitErrorCode === "usernameTaken"
      ? "login.registerErrorUsernameTaken"
      : submitErrorCode === "serviceUnavailable"
        ? "login.registerErrorServiceUnavailable"
        : submitErrorCode === "unknown"
          ? "login.registerErrorUnknown"
          : null
  const form = useForm({
    defaultValues: {
      confirmPassword: "",
      password: "",
      username: "",
    },
    validators: {
      onSubmit: createRegisterSchema(t),
    },
    onSubmit: async ({ value }) => {
      try {
        await register({
          password: value.password,
          username: value.username,
        })
        onRegisterSuccess()
      } catch (error) {
        setSubmitErrorCode(resolveRegisterErrorCode(error))
      }
    },
  })

  function resolveRegisterErrorCode(error: unknown): RegisterErrorCode {
    if (error instanceof ApiError && error.status === 409 && error.code === "auth.username_taken") {
      return "usernameTaken"
    }
    if ((error instanceof ApiError && error.status === 503) || error instanceof TransportError) {
      return "serviceUnavailable"
    }
    return "unknown"
  }

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
        setSubmitErrorCode(null)
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

      {submitErrorMessageKey && (
        <Alert variant="destructive">
          <AlertTitle>{t("login.registerErrorTitle")}</AlertTitle>
          <AlertDescription>{t(submitErrorMessageKey)}</AlertDescription>
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
