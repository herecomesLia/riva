import { Link } from "@tanstack/react-router"
import { AlertCircleIcon, BriefcaseBusinessIcon, LoaderCircleIcon } from "lucide-react"
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
import type { ActivePracticeSelection, PracticeSetupContext } from "@/models/practice"

export function PracticeLoadingState() {
  const { t } = useTranslation()

  return (
    <Card aria-busy="true" data-testid="practice-loading-state">
      <CardHeader>
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

export function PracticeNoRolesState() {
  const { t } = useTranslation()

  return (
    <Card data-testid="practice-no-roles-state">
      <CardHeader>
        <CardTitle>
          <h2>{t("practice.setup.title")}</h2>
        </CardTitle>
        <CardDescription>{t("practice.setup.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BriefcaseBusinessIcon />
            </EmptyMedia>
            <EmptyTitle>{t("practice.noRoles.title")}</EmptyTitle>
            <EmptyDescription>{t("practice.noRoles.description")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link to="/roles" />}>
              {t("practice.actions.manageRoles")}
            </Button>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  )
}

export function PracticeGeneratingState({
  context,
  selection,
}: {
  context: PracticeSetupContext
  selection: ActivePracticeSelection
}) {
  const { t } = useTranslation()

  return (
    <Card aria-busy="true" data-testid="practice-generating-state">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
          {t("practice.generation.title")}
        </CardTitle>
        <CardDescription>{t("practice.generation.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <PracticeSelectionSummary context={context} selection={selection} />
        <p className="text-sm text-muted-foreground">{t("practice.generation.progress")}</p>
      </CardContent>
    </Card>
  )
}

export function PracticeGenerationErrorState({
  context,
  isRetrying,
  onRetry,
  selection,
}: {
  context: PracticeSetupContext
  isRetrying: boolean
  onRetry: () => void
  selection: ActivePracticeSelection
}) {
  const { t } = useTranslation()

  return (
    <Card data-testid="practice-generation-error-state">
      <CardHeader>
        <CardTitle>
          <h2>{t("practice.setup.title")}</h2>
        </CardTitle>
        <CardDescription>{t("practice.setup.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{t("practice.errors.generationTitle")}</AlertTitle>
          <AlertDescription>{t("practice.errors.generationDescription")}</AlertDescription>
        </Alert>
        <PracticeSelectionSummary context={context} selection={selection} />
      </CardContent>
      <CardFooter>
        <Button disabled={isRetrying} onClick={onRetry}>
          {isRetrying && <Spinner aria-hidden="true" data-icon="inline-start" />}
          {isRetrying
            ? t("practice.actions.retryingGeneration")
            : t("practice.actions.retryGeneration")}
        </Button>
      </CardFooter>
    </Card>
  )
}

export function PracticeSelectionSummary({
  context,
  selection,
}: {
  context: PracticeSetupContext
  selection: ActivePracticeSelection
}) {
  const { t } = useTranslation()
  const role = context.targetRoles.find((candidate) => candidate.id === selection.targetRoleId)

  const items = [
    [t("practice.summary.targetRole"), role?.title ?? t("practice.session.unknownRole")],
    [t("practice.summary.questionType"), t(`practice.questionTypes.${selection.questionType}`)],
    [t("practice.summary.difficulty"), t(`practice.difficulty.${selection.difficulty}`)],
    [t("practice.summary.source"), t(`practice.sources.${selection.source}`)],
  ]

  return (
    <dl className="grid gap-4 rounded-xl bg-muted/60 p-4 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div className="flex min-w-0 flex-col gap-1" key={label}>
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className="truncate text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
