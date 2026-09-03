import { Link } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  BriefcaseBusinessIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  MapPinIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardRecruitmentType, DashboardResponse } from "@/models/dashboard"
import type { Loadable } from "@/types"

const currentRoleStatusStyles = {
  complete:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300",
  incomplete:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-300",
} as const

const recruitmentTypeKeys: Record<DashboardRecruitmentType, string> = {
  campus: "dashboard.currentRole.recruitmentTypes.campus",
  experienced: "dashboard.currentRole.recruitmentTypes.experienced",
}

type CurrentRoleCardProps = {
  state: Loadable<DashboardResponse["currentRole"]>
}

export function CurrentRoleCard({ state }: CurrentRoleCardProps) {
  const { t } = useTranslation()
  const isLoading = state.status === "loading"
  const currentRole = state.status === "ready" ? state.data : null

  return (
    <Card className="lg:col-span-5">
      <CardHeader>
        <CardTitle>{t("dashboard.currentRole.eyebrow")}</CardTitle>

        {isLoading ? (
          <CurrentRoleLoadingHeader />
        ) : currentRole ? (
          <CurrentRoleHeader currentRole={currentRole} />
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <CurrentRoleLoadingContent />
        ) : currentRole ? (
          <CurrentRoleDataContent currentRole={currentRole} />
        ) : (
          <CurrentRoleEmptyContent />
        )}
      </CardContent>
    </Card>
  )
}

function CurrentRoleLoadingHeader() {
  return (
    <>
      <CardAction>
        <Skeleton className="h-8 w-20" />
      </CardAction>
      <Skeleton className="h-4 w-4/5" data-slot="card-description" />
    </>
  )
}

function CurrentRoleHeader({
  currentRole,
}: {
  currentRole: NonNullable<DashboardResponse["currentRole"]>
}) {
  const { t } = useTranslation()
  const context = [
    currentRole.company,
    currentRole.recruitmentType && t(recruitmentTypeKeys[currentRole.recruitmentType]),
  ].filter(Boolean)

  return (
    <>
      <CardAction>
        <Button nativeButton={false} render={<Link to="/roles" />} size="sm" variant="outline">
          {t("dashboard.currentRole.actions.adjust")}
        </Button>
      </CardAction>
      {context.length > 0 && <CardDescription>{context.join(" · ")}</CardDescription>}
    </>
  )
}

function CurrentRoleLoadingContent() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-3/5" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
      <div className="flex flex-col items-start gap-2">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>
    </>
  )
}

function CurrentRoleEmptyContent() {
  const { t } = useTranslation()

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BriefcaseBusinessIcon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="font-heading text-2xl font-medium tracking-tight">
            {t("dashboard.currentRole.empty.title")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.currentRole.empty.description")}
          </p>
        </div>
      </div>
      <Button
        className="self-start"
        nativeButton={false}
        render={<Link to="/roles" />}
        size="sm"
        variant="link"
      >
        {t("dashboard.currentRole.empty.action")}
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </>
  )
}

function CurrentRoleDataContent({
  currentRole,
}: {
  currentRole: NonNullable<DashboardResponse["currentRole"]>
}) {
  const { t } = useTranslation()

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BriefcaseBusinessIcon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-heading text-2xl font-medium tracking-tight">
            {currentRole.title}
          </p>
          {currentRole.location && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPinIcon className="size-3.5 shrink-0" />
              {currentRole.location}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap gap-2">
          <RoleStatusBadge complete={currentRole.profileCompleted} type="profile" />
          <RoleStatusBadge complete={currentRole.jobDescriptionAdded} type="jobDescription" />
        </div>
        {!currentRole.profileCompleted ? (
          <Button nativeButton={false} render={<Link to="/profile" />} size="sm" variant="link">
            {t("dashboard.currentRole.actions.completeProfile")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        ) : !currentRole.jobDescriptionAdded ? (
          <Button nativeButton={false} render={<Link to="/roles" />} size="sm" variant="link">
            {t("dashboard.currentRole.actions.addJobDescription")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        ) : null}
      </div>
    </>
  )
}

function RoleStatusBadge({
  complete,
  type,
}: {
  complete: boolean
  type: "profile" | "jobDescription"
}) {
  const { t } = useTranslation()
  const status = complete ? "complete" : "incomplete"
  const Icon = complete ? CircleCheckIcon : CircleAlertIcon

  return (
    <Badge className={currentRoleStatusStyles[status]} variant="outline">
      <Icon className="size-3.5" />
      {t(`dashboard.currentRole.status.${type}.${status}`)}
    </Badge>
  )
}
