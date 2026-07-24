import { ArrowLeftIcon, CheckCircle2Icon, RotateCcwIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

export type InterviewReviewViewProps =
  | { status: "generating" }
  | { status: "ready"; onBack: () => void }
  | {
      status: "error"
      isRetrying: boolean
      onRetry: () => void
      onBack: () => void
    }

export function InterviewReviewView(props: InterviewReviewViewProps) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 sm:px-0">
      <header className="flex flex-col gap-2">
        <Badge variant="secondary">{t("interview.review.badge")}</Badge>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {props.status === "generating"
            ? t("interview.review.generatingTitle")
            : props.status === "ready"
              ? t("interview.review.readyTitle")
              : t("interview.review.errorTitle")}
        </h1>
      </header>

      {props.status === "generating" ? (
        <Card aria-busy="true" data-testid="interview-review-generating">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Spinner aria-hidden="true" />
              {t("interview.review.generatingTitle")}
            </CardTitle>
            <CardDescription>{t("interview.review.generatingDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-36 w-full" />
          </CardContent>
        </Card>
      ) : props.status === "ready" ? (
        <Card>
          <CardHeader>
            <CheckCircle2Icon aria-hidden="true" className="mb-2 text-primary" />
            <CardTitle>{t("interview.review.readyTitle")}</CardTitle>
            <CardDescription>{t("interview.review.readyDescription")}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={props.onBack} variant="outline">
              <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
              {t("interview.review.actions.backToSetup")}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card role="alert">
          <CardHeader>
            <CardTitle>{t("interview.review.errorTitle")}</CardTitle>
            <CardDescription>{t("interview.review.errorDescription")}</CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-wrap gap-2">
            <Button disabled={props.isRetrying} onClick={props.onRetry}>
              {props.isRetrying ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
              )}
              {t("interview.review.actions.retry")}
            </Button>
            <Button onClick={props.onBack} variant="outline">
              <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
              {t("interview.review.actions.backToSetup")}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
