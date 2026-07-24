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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import type { InterviewConfiguration, InterviewSetupViewData } from "@/models/interview"

import { InterviewSetupForm } from "./components/InterviewSetupForm"

export type InterviewViewProps =
  | {
      status: "loading"
    }
  | {
      status: "ready"
      setup: InterviewSetupViewData
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

export function InterviewView(props: InterviewViewProps) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6 px-4 sm:px-0">
      <InterviewHeader />
      <div className="w-full max-w-4xl">
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

  return (
    <InterviewSetupCard>
      <InterviewSetupForm
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
  const { t } = useTranslation()

  return (
    <InterviewSetupCard>
      <CardContent aria-busy="true" data-testid="interview-loading-state">
        <FieldGroup className="gap-0">
          <Field className="pb-6">
            <FieldLabel>{t("interview.setup.fields.targetRole")}</FieldLabel>
            <Skeleton className="h-9 w-full" />
          </Field>
          <Field className="border-t border-border py-6">
            <FieldLabel>{t("interview.setup.fields.round")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-20" />
            </div>
          </Field>
          <Field className="border-t border-border pt-6">
            <FieldLabel>{t("interview.setup.fields.difficulty")}</FieldLabel>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
            </div>
          </Field>
          <Field className="border-t border-border pt-6">
            <FieldLabel>{t("interview.setup.fields.duration")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
            </div>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="mt-7 border-t">
        <Skeleton className="h-10 w-full sm:w-40" />
      </CardFooter>
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
