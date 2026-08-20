import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

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
import { Spinner } from "@/components/ui/spinner"

export function PracticeEvaluationStatus({
  error,
  isRetrying,
  onRetry,
  pollingTimedOut = false,
}: {
  error: boolean
  isRetrying: boolean
  onRetry: () => void
  pollingTimedOut?: boolean
}) {
  const { t } = useTranslation()

  if (error) {
    return (
      <Card data-testid="practice-evaluation-error">
        <CardHeader>
          <CardTitle>{t("practice.evaluating.title")}</CardTitle>
          <CardDescription>{t("practice.evaluating.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>
              {pollingTimedOut
                ? t("common.agentPolling.timeoutTitle")
                : t("practice.errors.evaluationTitle")}
            </AlertTitle>
            <AlertDescription>
              {pollingTimedOut
                ? t("common.agentPolling.timeoutDescription")
                : t("practice.errors.evaluationDescription")}
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button disabled={isRetrying} onClick={onRetry}>
            {isRetrying && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {isRetrying
              ? t("practice.evaluating.retrying")
              : pollingTimedOut
                ? t("common.agentPolling.recheck")
                : t("practice.evaluating.retry")}
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card aria-busy="true" aria-live="polite">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
          {t("practice.evaluating.title")}
        </CardTitle>
        <CardDescription>{t("practice.evaluating.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{t("practice.evaluating.progress")}</p>
      </CardContent>
    </Card>
  )
}
