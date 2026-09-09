import { CalendarClockIcon, UploadIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { CareerProfileResponse } from "@/api/generated/models"
import { Button } from "@/components/ui/button"

import { ProfileCompletenessRing } from "./ProfileCompletenessRing"
import { formatDate } from "./profile-formatters"
import { ProfileHeaderIntro } from "./ProfileHeaderIntro"

export function ProfileHeader({
  onOpenResume,
  profile,
}: {
  onOpenResume: () => void
  profile: CareerProfileResponse
}) {
  const { i18n, t } = useTranslation()

  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 @3xl/app:grid-cols-[minmax(0,1fr)_auto_auto] @3xl/app:gap-6">
      <div className="col-span-2 flex min-w-0 flex-col gap-2 @3xl/app:col-span-1">
        <ProfileHeaderIntro />
        <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <CalendarClockIcon className="size-4 shrink-0" />
          {t("profile.updatedAt", { value: formatDate(profile.updatedAt, i18n.language) })}
        </p>
      </div>

      <div className="justify-self-start @3xl/app:px-4">
        <ProfileCompletenessRing value={getProfileCompleteness(profile)} />
      </div>

      <Button
        className="h-auto min-h-10 max-w-full justify-self-end whitespace-normal py-2 text-center"
        onClick={onOpenResume}
        size="lg"
      >
        <UploadIcon data-icon="inline-start" />
        {t("profile.actions.updateResume")}
      </Button>
    </header>
  )
}

function getProfileCompleteness(profile: CareerProfileResponse) {
  return (
    [profile.education, profile.workExperiences, profile.projects, profile.skills].filter(
      (section) => section.length > 0,
    ).length * 25
  )
}
