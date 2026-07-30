import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/hooks/use-auth"

type SessionStatus = "restoring" | "ready" | "error"

export function AuthSessionBootstrap({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { restoreCurrentUser } = useAuth()
  const restoreStarted = useRef(false)
  const [status, setStatus] = useState<SessionStatus>("restoring")

  const restore = useCallback(async () => {
    setStatus("restoring")

    try {
      await restoreCurrentUser()
      setStatus("ready")
    } catch {
      setStatus("error")
    }
  }, [restoreCurrentUser])

  useEffect(() => {
    if (restoreStarted.current) return
    restoreStarted.current = true
    void restore()
  }, [restore])

  if (status === "ready") return children

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      {status === "restoring" ? (
        <div className="flex items-center gap-3" aria-busy="true">
          <Spinner />
          <p className="text-sm text-muted-foreground">{t("app.restoringSession")}</p>
        </div>
      ) : (
        <Alert className="max-w-md" variant="destructive">
          <AlertTitle>{t("app.restoreSessionFailed")}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-4">
            <span>{t("app.restoreSessionFailedDescription")}</span>
            <Button onClick={() => void restore()} size="sm" variant="outline">
              {t("app.retrySessionRestore")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </main>
  )
}
