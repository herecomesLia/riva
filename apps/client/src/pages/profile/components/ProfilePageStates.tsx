import { AlertCircleIcon, FileUpIcon, LoaderCircleIcon } from "lucide-react"
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"

export function ProfileLoadingState() {
  return (
    <div className="flex flex-col gap-6" data-testid="profile-loading-state">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-44" />
            <Skeleton className="h-5 w-full max-w-2xl" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <Card size="sm">
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-5 w-32" />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <ProfileSkeletonCard className="lg:col-span-7" />
        <ProfileSkeletonCard className="lg:col-span-5" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileSkeletonCard />
        <ProfileSkeletonCard />
      </div>
    </div>
  )
}

function ProfileSkeletonCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-4 w-4/5" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
      </CardContent>
    </Card>
  )
}

export function ProfileEmptyState() {
  const { t } = useTranslation()

  return (
    <Empty data-testid="profile-empty-state">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileUpIcon />
        </EmptyMedia>
        <EmptyTitle>{t("profile.empty.title")}</EmptyTitle>
        <EmptyDescription>{t("profile.empty.description")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function ProfileProcessingState({
  status,
}: {
  status: "uploadingResume" | "parsingResume"
}) {
  const { t } = useTranslation()
  const stateKey = status === "uploadingResume" ? "uploading" : "parsing"

  return (
    <Card data-testid="profile-processing-state">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LoaderCircleIcon className="size-5" />
          {t(`profile.lifecycle.${stateKey}.title`)}
        </CardTitle>
        <CardDescription>{t(`profile.lifecycle.${stateKey}.description`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-5 w-full max-w-md" />
        <Skeleton className="h-5 w-4/5 max-w-sm" />
      </CardContent>
    </Card>
  )
}

export function ProfileRecognitionFailureState({
  failureReason,
  onManualEntry,
  onReupload,
  onRetry,
}: {
  failureReason: string | null
  onManualEntry: () => void
  onReupload: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <Alert data-testid="profile-recognition-failure" variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{t("profile.lifecycle.failed.title")}</AlertTitle>
      <AlertDescription>
        {failureReason ?? t("profile.lifecycle.failed.description")}
      </AlertDescription>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={onRetry} size="sm">
          {t("profile.actions.retryRecognition")}
        </Button>
        <Button onClick={onReupload} size="sm" variant="outline">
          {t("profile.actions.updateResume")}
        </Button>
        <Button onClick={onManualEntry} size="sm" variant="outline">
          {t("profile.actions.manualEntry")}
        </Button>
      </div>
    </Alert>
  )
}

export function ProfileErrorState({
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
          {isRetrying ? t("common.pageState.error.retrying") : t("common.pageState.error.retry")}
        </Button>
      </CardFooter>
    </Card>
  )
}
