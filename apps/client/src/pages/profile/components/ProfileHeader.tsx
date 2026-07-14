import { CalendarClockIcon, CircleCheckIcon, ListChecksIcon, UploadIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { JobProfile } from "@/models/profile"

import { formatDate } from "./profile-formatters"

export function ProfileHeader({
  onOpenResume,
  profile,
}: {
  onOpenResume: () => void
  profile: JobProfile
}) {
  const { i18n, t } = useTranslation()

  return (
    <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
            {t("profile.title")}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {t("profile.description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClockIcon className="size-4" />
            {t("profile.updatedAt", { value: formatDate(profile.updatedAt, i18n.language) })}
          </p>
          <Button onClick={onOpenResume} size="sm">
            <UploadIcon data-icon="inline-start" />
            {profile.resume ? t("profile.actions.updateResume") : t("profile.actions.uploadResume")}
          </Button>
        </div>
      </div>

      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CircleCheckIcon className="size-4 text-primary" />
            {t("profile.completeness")}
          </div>
          <p className="font-heading text-4xl font-semibold tracking-tight">
            {profile.completeness.percentage}%
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ListChecksIcon className="size-4" />
            {t("profile.pendingReviewCount", { count: profile.pendingReviewCount })}
          </div>
        </CardContent>
      </Card>
    </header>
  )
}
