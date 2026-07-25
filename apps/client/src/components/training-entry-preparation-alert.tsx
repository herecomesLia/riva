import { AlertCircleIcon, CheckCircle2Icon, TriangleAlertIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type {
  TrainingEntryAdjustmentReason,
  TrainingEntryResolution,
} from "@/models/training-entry"

export function TrainingEntryPreparationAlert({
  confirmed,
  onConfirm,
  resolution,
}: {
  confirmed: boolean
  onConfirm: () => void
  resolution: TrainingEntryResolution<unknown>
}) {
  const { t } = useTranslation()

  if (resolution.status === "available") {
    return (
      <Alert data-testid="history-entry-available">
        <CheckCircle2Icon aria-hidden="true" />
        <AlertTitle>{t("common.trainingEntry.available.title")}</AlertTitle>
        <AlertDescription>{t("common.trainingEntry.available.description")}</AlertDescription>
      </Alert>
    )
  }

  if (resolution.status === "roleUnavailable") {
    return (
      <Alert data-testid="history-entry-role-unavailable">
        <TriangleAlertIcon aria-hidden="true" />
        <AlertTitle>{t("common.trainingEntry.roleUnavailable.title")}</AlertTitle>
        <AlertDescription>
          {t(`common.trainingEntry.roleUnavailable.reasons.${resolution.reason}`)}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert data-testid="history-entry-adjusted">
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>{t("common.trainingEntry.adjusted.title")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{t("common.trainingEntry.adjusted.description")}</span>
        <ul className="list-disc pl-5">
          {resolution.adjustments.map((reason: TrainingEntryAdjustmentReason) => (
            <li key={reason}>{t(`common.trainingEntry.adjustments.${reason}`)}</li>
          ))}
        </ul>
        {!confirmed && (
          <Button onClick={onConfirm} size="sm" type="button" variant="outline">
            {t("common.trainingEntry.adjusted.confirm")}
          </Button>
        )}
        {confirmed && <span>{t("common.trainingEntry.adjusted.confirmed")}</span>}
      </AlertDescription>
    </Alert>
  )
}

export function TrainingEntryPreparationFailure({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <Alert data-testid="history-entry-failed" variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>{t("common.trainingEntry.failed.title")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{t("common.trainingEntry.failed.description")}</span>
        <Button disabled={isRetrying} onClick={onRetry} size="sm" type="button" variant="outline">
          {isRetrying && <Spinner aria-hidden="true" data-icon="inline-start" />}
          {isRetrying
            ? t("common.trainingEntry.failed.retrying")
            : t("common.trainingEntry.failed.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
