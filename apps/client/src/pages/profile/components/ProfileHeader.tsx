import { CalendarClockIcon, ListChecksIcon, UploadIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import type { JobProfile } from "@/models/profile"

import { ProfileCompletenessRing } from "./ProfileCompletenessRing"
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
    <header className="grid items-start gap-y-0 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:grid-rows-[auto_auto] lg:gap-x-6">
      <div className="order-1 flex min-w-0 flex-col gap-2 lg:col-start-1 lg:row-start-1">
        <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
          {t("profile.title")}
        </h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          {t("profile.description")}
        </p>
      </div>

      <div className="order-2 justify-self-center lg:col-start-2 lg:row-start-1 lg:pr-10">
        <ProfileCompletenessRing value={profile.completeness.percentage} />
      </div>

      <p className="order-4 flex min-w-0 items-center gap-2 text-sm text-muted-foreground lg:col-start-1 lg:row-start-2 lg:self-center">
        <CalendarClockIcon className="size-4 shrink-0" />
        {t("profile.updatedAt", { value: formatDate(profile.updatedAt, i18n.language) })}
      </p>

      <div className="order-3 flex items-center gap-2 justify-self-center text-sm text-muted-foreground lg:col-start-2 lg:row-start-2 lg:self-center lg:pr-10">
        <ListChecksIcon className="size-4 shrink-0" />
        {t("profile.pendingReviewCount", { count: profile.pendingReviewCount })}
      </div>

      <Button
        className="order-5 max-w-full justify-self-start lg:col-start-3 lg:row-start-2 lg:self-center lg:justify-self-end"
        onClick={onOpenResume}
        size="lg"
      >
        <UploadIcon data-icon="inline-start" />
        {profile.resume ? t("profile.actions.updateResume") : t("profile.actions.uploadResume")}
      </Button>
    </header>
  )
}
