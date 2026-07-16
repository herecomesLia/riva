import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { JobProfile } from "@/models/profile"

import { ProfileSectionCard } from "./ProfileSectionCard"
import { DateRange, DetailList, EmptySection } from "./profile-section-shared"
import { employmentTypeLabel } from "./profile-formatters"

export type WorkExperienceCardProps = {
  experiences: JobProfile["workExperiences"]
  onEdit: () => void
  skills: JobProfile["skills"]
}

export function WorkExperienceCard({ experiences, onEdit, skills }: WorkExperienceCardProps) {
  const { t } = useTranslation()
  const skillsById = new Map(skills.map((skill) => [skill.id, skill.name]))

  return (
    <ProfileSectionCard onEdit={onEdit} section="workExperience">
      {experiences.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="flex flex-col gap-6">
          {experiences.map((experience, index) => (
            <article key={experience.id} className="flex flex-col gap-4">
              {index > 0 && <Separator />}
              <div className="flex flex-col gap-1">
                <h3 className="font-heading text-lg font-medium">{experience.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {[
                    experience.company,
                    employmentTypeLabel(experience.employmentType, t),
                    experience.location,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <DateRange
                  endDate={experience.endDate}
                  isCurrent={experience.isCurrent}
                  startDate={experience.startDate}
                />
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <DetailList
                  items={experience.responsibilities}
                  title={t("profile.field.responsibilities")}
                />
                <DetailList
                  items={experience.achievements}
                  title={t("profile.field.achievements")}
                />
              </div>
              {experience.skillIds.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-medium">{t("profile.field.skills")}</h4>
                  <div className="flex flex-wrap gap-2">
                    {experience.skillIds.map((skillId) => (
                      <Badge key={skillId} variant="outline">
                        {skillsById.get(skillId) ?? skillId}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </ProfileSectionCard>
  )
}
