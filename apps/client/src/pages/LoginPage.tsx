import { ArrowRightIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"

import { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function LoginPage() {
  const { t } = useTranslation()

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
            <form>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">{t("login.email")}</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    placeholder={t("login.emailPlaceholder")}
                    type="email"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">{t("login.password")}</FieldLabel>
                  <Input id="password" name="password" type="password" />
                </Field>
                <Alert>
                  <AlertTitle>{t("login.demoTitle")}</AlertTitle>
                  <AlertDescription>{t("login.demoDescription")}</AlertDescription>
                </Alert>
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter>
            <Button className="w-full" nativeButton={false} render={<Link to="/dashboard" />}>
              <ArrowRightIcon data-icon="inline-end" />
              {t("login.continue")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
