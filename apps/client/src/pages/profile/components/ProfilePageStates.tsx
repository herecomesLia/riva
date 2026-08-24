import { AlertCircleIcon, CalendarClockIcon, FileUpIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

import { ProfileHeaderIntro } from "./ProfileHeaderIntro"

export function ProfileLoadingState() {
  const { t } = useTranslation()

  return (
    <div aria-busy="true" className="flex flex-col gap-6" data-testid="profile-loading-state">
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex min-w-0 flex-col gap-2">
          <ProfileHeaderIntro />
          <div
            aria-label={t("common.pageState.loading.title")}
            className="flex min-w-0 items-center gap-2"
          >
            <CalendarClockIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <Skeleton className="h-4 w-36 max-w-full" />
          </div>
        </div>
        <div className="justify-self-center lg:pr-6">
          <Skeleton className="size-24 rounded-full" />
        </div>
        <Skeleton className="h-8 w-28 max-w-full justify-self-start lg:justify-self-end" />
      </div>
      <div
        className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]"
        data-testid="profile-loading-summary-sections"
      >
        <ProfileSkeletonCard className="h-full" section="education" />
        <ProfileSkeletonCard className="h-full" section="skills" />
      </div>
      <ProfileSkeletonCard section="workExperience" />
      <ProfileSkeletonCard section="projectExperience" />
    </div>
  )
}

type LoadingProfileSection = "education" | "skills" | "workExperience" | "projectExperience"

function ProfileSkeletonCard({
  className,
  section,
}: {
  className?: string
  section: LoadingProfileSection
}) {
  const { t } = useTranslation()

  return (
    <Card aria-busy="true" className={className} data-testid="profile-skeleton-card">
      <CardHeader>
        <CardTitle>
          <h2>{t(`profile.sections.${section}`)}</h2>
        </CardTitle>
        <CardAction>
          <Skeleton className="h-8 w-20 rounded-md" />
        </CardAction>
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

export function ProfileProcessingState() {
  const { t } = useTranslation()

  return (
    <Card data-testid="profile-processing-state">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Spinner className="size-5" />
          {t("profile.lifecycle.parsing.title")}
        </CardTitle>
        <CardDescription>{t("profile.lifecycle.parsing.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-5 w-full max-w-md" />
        <Skeleton className="h-5 w-4/5 max-w-sm" />
      </CardContent>
    </Card>
  )
}

export function ProfileErrorState({ onRetry }: { onRetry: () => void }) {
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
        <Button onClick={onRetry}>{t("common.pageState.error.retry")}</Button>
      </CardFooter>
    </Card>
  )
}
