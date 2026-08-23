import { Link } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  BriefcaseBusinessIcon,
  FileTextIcon,
  UserRoundPenIcon,
} from "lucide-react"
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

export function PracticeLoadingState() {
  const { t } = useTranslation()

  return (
    <Card aria-busy="true" data-testid="practice-loading-state">
      <CardHeader className="border-b">
        <CardTitle>
          <h2>{t("practice.setup.title")}</h2>
        </CardTitle>
        <CardDescription>{t("practice.loading.cardDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <Skeleton className="h-9 w-32" />
      </CardContent>
    </Card>
  )
}

export function PracticeLoadErrorState({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <Card role="alert">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircleIcon />
          {t("common.pageState.error.title")}
        </CardTitle>
        <CardDescription>{t("common.pageState.error.description")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button disabled={isRetrying} onClick={onRetry}>
          {isRetrying && <Spinner aria-hidden="true" data-icon="inline-start" />}
          {isRetrying ? t("common.pageState.error.retrying") : t("common.pageState.error.retry")}
        </Button>
      </CardFooter>
    </Card>
  )
}

export function PracticeSetupBlockedState({
  reason,
}: {
  reason: "noTargetRoles" | "profileIncomplete" | "jobDescriptionMissing"
}) {
  const { t } = useTranslation()
  const destination = reason === "profileIncomplete" ? "/profile" : "/roles"
  const Icon =
    reason === "profileIncomplete"
      ? UserRoundPenIcon
      : reason === "jobDescriptionMissing"
        ? FileTextIcon
        : BriefcaseBusinessIcon

  return (
    <Card
      data-testid={
        reason === "noTargetRoles" ? "practice-no-roles-state" : `practice-${reason}-state`
      }
    >
      <CardHeader className="border-b">
        <CardTitle>
          <h2>{t("practice.setup.title")}</h2>
        </CardTitle>
        <CardDescription>{t("practice.setup.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t(`practice.prerequisites.${reason}.title`)}</EmptyTitle>
            <EmptyDescription>{t(`practice.prerequisites.${reason}.description`)}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link to={destination} />}>
              <Icon aria-hidden="true" data-icon="inline-start" />
              {t(`practice.prerequisites.${reason}.action`)}
            </Button>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  )
}
