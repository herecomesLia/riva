import { AlertCircleIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

export function PracticeTaskFailure({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <Card role="alert" data-testid="practice-task-failure">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircleIcon aria-hidden="true" />
          {t("practice.taskFailure.title")}
        </CardTitle>
        <CardDescription>{t("practice.taskFailure.description")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button disabled={isRetrying} onClick={onRetry}>
          {isRetrying && <Spinner aria-hidden="true" data-icon="inline-start" />}
          {isRetrying ? t("practice.taskFailure.retrying") : t("practice.taskFailure.retry")}
        </Button>
      </CardFooter>
    </Card>
  )
}
