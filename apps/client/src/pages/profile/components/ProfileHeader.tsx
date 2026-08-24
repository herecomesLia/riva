import { CalendarClockIcon, UploadIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import type { Profile } from "@/models/profile"

import { ProfileCompletenessRing } from "./ProfileCompletenessRing"
import { formatDate } from "./profile-formatters"
import { ProfileHeaderIntro } from "./ProfileHeaderIntro"

export function ProfileHeader({
  onOpenResume,
  profile,
}: {
  onOpenResume?: () => void
  profile: Profile
}) {
  const { i18n, t } = useTranslation()

  const sections = [
    profile.content.education,
    profile.content.workExperiences,
    profile.content.projectExperiences,
    profile.content.skills,
  ]
  const completeness = Math.round(
    (sections.filter((section) => section.length > 0).length / sections.length) * 100,
  )

  return (
    <header className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="flex min-w-0 flex-col gap-2">
        <ProfileHeaderIntro />
        <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <CalendarClockIcon className="size-4 shrink-0" />
          {t("profile.updatedAt", { value: formatDate(profile.updatedAt, i18n.language) })}
        </p>
      </div>

      <div className="justify-self-center lg:pr-6">
        <ProfileCompletenessRing value={completeness} />
      </div>

      {onOpenResume && (
        <Button
          className="max-w-full justify-self-start lg:justify-self-end"
          onClick={onOpenResume}
          size="lg"
        >
          <UploadIcon data-icon="inline-start" />
          {t("profile.actions.uploadResume")}
        </Button>
      )}
    </header>
  )
}
