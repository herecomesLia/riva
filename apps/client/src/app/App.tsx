import { AlertCircleIcon } from "lucide-react"
import type { PropsWithChildren } from "react"
import { useTranslation } from "react-i18next"

import { AppProviders } from "./providers"
import { AppRouter } from "@/app/router"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/hooks/use-auth"

export function AuthBootstrap({ children }: PropsWithChildren) {
  const { t } = useTranslation()
  const { isError, isPending, retry } = useAuth()

  if (!isPending && !isError) {
    return children
  }

  if (isError) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md" role="alert">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircleIcon aria-hidden="true" />
              {t("common.pageState.error.title")}
            </CardTitle>
            <CardDescription>{t("common.pageState.error.description")}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => void retry()}>{t("common.pageState.error.retry")}</Button>
          </CardFooter>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div aria-busy="true" className="flex flex-col items-center gap-3 text-center" role="status">
        <Spinner aria-hidden="true" className="size-6" role="presentation" />
        <div>
          <h1 className="font-heading text-lg font-medium">
            {t("common.pageState.loading.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("common.pageState.loading.description")}
          </p>
        </div>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <AppProviders>
      <AuthBootstrap>
        <AppRouter />
      </AuthBootstrap>
    </AppProviders>
  )
}
