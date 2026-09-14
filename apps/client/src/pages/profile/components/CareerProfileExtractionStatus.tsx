import { useTranslation } from "react-i18next"

import type { TaskFailureResponse, TaskStatusResponse } from "@/api/generated/models"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function CareerProfileExtractionStatus({
  state,
  synchronizationError,
  pending,
  onRetry,
  onAbort,
  onReimport,
  onResynchronize,
}: {
  state: TaskStatusResponse | TaskFailureResponse | undefined
  synchronizationError: boolean
  pending: boolean
  onRetry: () => void
  onAbort: () => void
  onReimport: () => void
  onResynchronize: () => void
}) {
  const { t } = useTranslation()
  if (synchronizationError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("profile.lifecycle.syncFailed.title")}</AlertTitle>
        <AlertDescription>
          {t("profile.lifecycle.syncFailed.description")}
          <Button disabled={pending} onClick={onResynchronize} variant="outline">
            {t("profile.lifecycle.syncFailed.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  if (!state)
    return (
      <div role="status" className="flex items-center gap-3">
        <Spinner />
        {t("profile.lifecycle.checking")}
      </div>
    )
  if (state.status === "idle") return null
  if (state.status === "failed") {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("profile.lifecycle.failed.title")}</AlertTitle>
        <AlertDescription>
          {state.error.message}
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={onRetry} variant="outline">
              {t("profile.actions.retryRecognition")}
            </Button>
            <Button disabled={pending} onClick={onReimport} variant="outline">
              {t("profile.actions.updateResume")}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <Alert>
      <Spinner />
      <AlertTitle>
        {state.status === "aborting"
          ? t("profile.lifecycle.aborting")
          : t("profile.lifecycle.recognizing.title")}
      </AlertTitle>
      <AlertDescription>
        {t("profile.lifecycle.recognizing.description")}
        <Button
          disabled={pending || state.status === "aborting"}
          onClick={onAbort}
          variant="outline"
        >
          {t("profile.actions.abortExtraction")}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
