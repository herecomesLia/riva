import { CalendarDaysIcon, GraduationCapIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { ProfileEducation } from "@/models/profile"

import { ProfileItemCarousel } from "./ProfileItemCarousel"
import { ProfileSectionCard } from "./ProfileSectionCard"
import { EmptySection } from "./profile-section-shared"
import { formatMonth } from "./profile-formatters"

export type EducationCardProps = {
  education: ProfileEducation[]
  onEdit: () => void
}

export function EducationCard({ education, onEdit }: EducationCardProps) {
  const { t } = useTranslation()

  return (
    <ProfileSectionCard
      className="h-full [--card-spacing:--spacing(4)]"
      contentClassName="flex flex-1 flex-col"
      onEdit={onEdit}
      section="education"
    >
      {education.length === 0 ? (
        <EmptySection />
      ) : (
        <ProfileItemCarousel
          getItemKey={(item) => item.school}
          itemCardClassName="border-border bg-card py-4"
          items={education}
          renderItem={(item) => {
            const degreeMajor = [item.degree, item.major].filter(Boolean).join(" · ")

            return (
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:size-12">
                  <GraduationCapIcon aria-hidden="true" className="size-5 sm:size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-heading text-base leading-5 font-semibold text-foreground">
                    {item.school}
                  </h3>
                  {degreeMajor && (
                    <p className="mt-0.5 break-words text-sm leading-5 text-muted-foreground">
                      {degreeMajor}
                    </p>
                  )}
                  <div className="mt-2">
                    <EducationDateRange
                      endDate={item.endDate}
                      isCurrent={item.isCurrent}
                      startDate={item.startDate}
                    />
                  </div>
                </div>
              </div>
            )
          }}
          sectionLabel={t("profile.sections.education")}
        />
      )}
    </ProfileSectionCard>
  )
}

function EducationDateRange({
  endDate,
  isCurrent,
  startDate,
}: {
  endDate: string | null
  isCurrent: boolean
  startDate: string | null
}) {
  const { i18n, t } = useTranslation()
  const start = formatMonth(startDate, i18n.language, "—")
  const end = isCurrent ? t("profile.field.present") : formatMonth(endDate, i18n.language, "—")

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <CalendarDaysIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 break-words">
        {t("profile.field.dateRange", {
          end,
          start,
        })}
      </span>
    </div>
  )
}
