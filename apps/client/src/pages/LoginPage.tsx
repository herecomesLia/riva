import { useForm } from "@tanstack/react-form"
import { useNavigate } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { LanguageSwitcher } from "@/components/common/LanguageSwitcher"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/stores/auth"

export function LoginPage() {
  const navigate = useNavigate()
  const signIn = useAuthStore((state) => state.signIn)
  const { t } = useTranslation()
  const formSchema = z.object({
    username: z.string().trim().min(1, t("login.usernameRequired")),
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
    onSubmit: ({ value }) => {
      signIn(value.username)
      void navigate({ to: "/dashboard" })
    },
  })

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm">
        <Card className="relative">
          <div className="absolute top-4 right-4">
            <LanguageSwitcher />
          </div>
          <CardHeader className="pr-14">
            <CardTitle>{t("login.title")}</CardTitle>
            <CardDescription>{t("login.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              id="login-form"
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
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>{t("login.username")}</FieldLabel>
                        <Input
                          aria-invalid={isInvalid}
                          id={field.name}
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
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
                          id={field.name}
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          type="password"
                          value={field.state.value}
                        />
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    )
                  }}
                </form.Field>
                <Alert>
                  <AlertTitle>{t("login.demoTitle")}</AlertTitle>
                  <AlertDescription>{t("login.demoDescription")}</AlertDescription>
                </Alert>
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter>
            <Button className="w-full" form="login-form" type="submit">
              <ArrowRightIcon data-icon="inline-end" />
              {t("login.continue")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
