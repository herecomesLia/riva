import { Link } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  BriefcaseBusinessIcon,
  FileTextIcon,
  RotateCcwIcon,
  UserRoundPenIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TrainingEntryPreparationFailure } from "@/components/training-entry-preparation-alert"
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
import type { InterviewConfiguration, InterviewSetup } from "@/models/interview-workflow"
import type { InterviewTrainingEntryResolution } from "@/models/training-entry"

import { InterviewSetupForm } from "./components/InterviewSetupForm"

export type InterviewViewProps =
  | {
      status: "loading"
    }
  | {
      status: "ready"
      setup: InterviewSetup
      historyEntryResolution?: InterviewTrainingEntryResolution
      isStarting: boolean
      onStart: (input: InterviewConfiguration) => Promise<void>
    }
  | {
      status: "empty"
    }
  | {
      status: "blocked"
      reason: "profileIncomplete" | "jobDescriptionMissing"
    }
  | {
      status: "error"
      isRetrying: boolean
      onRetry: () => void
    }
  | {
      status: "historyEntryError"
      isRetrying: boolean
      onRetry: () => void
    }

export function InterviewView(props: InterviewViewProps) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
      <InterviewHeader />
      <div className="w-full">
        <InterviewViewContent {...props} />
      </div>
    </div>
  )
}

function InterviewHeader() {
  const { t } = useTranslation()

  return (
    <header className="flex max-w-3xl flex-col gap-2">
      <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
        {t("interview.title")}
      </h1>
      <p className="text-base leading-7 text-muted-foreground">{t("interview.description")}</p>
    </header>
  )
}

function InterviewViewContent(props: InterviewViewProps) {
  if (props.status === "loading") return <InterviewLoadingState />
  if (props.status === "empty") return <InterviewEmptyState />
  if (props.status === "blocked") return <InterviewBlockedState reason={props.reason} />
  if (props.status === "error") {
    return <InterviewErrorState isRetrying={props.isRetrying} onRetry={props.onRetry} />
  }
  if (props.status === "historyEntryError") {
    return (
      <InterviewSetupCard>
        <CardContent>
          <TrainingEntryPreparationFailure isRetrying={props.isRetrying} onRetry={props.onRetry} />
        </CardContent>
      </InterviewSetupCard>
    )
  }

  return (
    <InterviewSetupCard>
      <InterviewSetupForm
        historyEntryResolution={props.historyEntryResolution}
        isPending={props.isStarting}
        onStart={props.onStart}
        setup={props.setup}
      />
    </InterviewSetupCard>
  )
}

function InterviewBlockedState({
  reason,
}: {
  reason: "profileIncomplete" | "jobDescriptionMissing"
}) {
  const { t } = useTranslation()
  const destination = reason === "profileIncomplete" ? "/profile" : "/roles"
  const Icon = reason === "profileIncomplete" ? UserRoundPenIcon : FileTextIcon

  return (
    <InterviewSetupCard>
      <CardContent>
        <Alert>
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>{t(`interview.prerequisites.${reason}.title`)}</AlertTitle>
          <AlertDescription>{t(`interview.prerequisites.${reason}.description`)}</AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter className="border-t">
        <Button nativeButton={false} render={<Link to={destination} />}>
          <Icon aria-hidden="true" data-icon="inline-start" />
          {t(`interview.prerequisites.${reason}.action`)}
        </Button>
      </CardFooter>
    </InterviewSetupCard>
  )
}

function InterviewSetupCard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t("interview.setup.title")}</CardTitle>
        <CardDescription>{t("interview.setup.description")}</CardDescription>
      </CardHeader>
      {children}
    </Card>
  )
}

function InterviewLoadingState() {
  return (
    <InterviewSetupCard>
      <CardContent
        aria-busy="true"
        className="flex flex-col gap-7"
        data-testid="interview-loading-state"
      >
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
    </InterviewSetupCard>
  )
}

function InterviewEmptyState() {
  const { t } = useTranslation()

  return (
    <InterviewSetupCard>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BriefcaseBusinessIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("interview.empty.title")}</EmptyTitle>
            <EmptyDescription>{t("interview.empty.description")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link to="/roles" />}>
              <BriefcaseBusinessIcon aria-hidden="true" data-icon="inline-start" />
              {t("interview.actions.addRole")}
            </Button>
          </EmptyContent>
        </Empty>
      </CardContent>
    </InterviewSetupCard>
  )
}

function InterviewErrorState({
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
          <AlertCircleIcon aria-hidden="true" />
          {t("interview.errors.loadTitle")}
        </CardTitle>
        <CardDescription>{t("interview.errors.loadDescription")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button disabled={isRetrying} onClick={onRetry}>
          {isRetrying ? (
            <Spinner aria-hidden="true" data-icon="inline-start" />
          ) : (
            <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
          )}
          {t("interview.actions.retry")}
        </Button>
      </CardFooter>
    </Card>
  )
}
