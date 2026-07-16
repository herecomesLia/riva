import {
  BriefcaseBusinessIcon,
  Building2Icon,
  CalendarDaysIcon,
  ChartColumnIncreasingIcon,
  NotebookPenIcon,
  TagsIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import type { JobProfile } from "@/models/profile"

import { employmentTypeLabel } from "./profile-formatters"
import { ProfileSectionCard } from "./ProfileSectionCard"
import { ProfileSkillBadge } from "./ProfileSkillBadge"
import { DateRange, DetailList, EmptySection } from "./profile-section-shared"

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
        <ol className="relative flex flex-col gap-6">
          {experiences.map((experience, index) => {
            const details = [
              experience.responsibilities.length > 0 && (
                <DetailList
                  icon={NotebookPenIcon}
                  items={experience.responsibilities}
                  key="responsibilities"
                  title={t("profile.field.responsibilities")}
                />
              ),
              experience.achievements.length > 0 && (
                <DetailList
                  icon={ChartColumnIncreasingIcon}
                  items={experience.achievements}
                  key="achievements"
                  title={t("profile.field.achievements")}
                />
              ),
              experience.skillIds.length > 0 && (
                <div className="flex flex-col gap-2" key="skills">
                  <h4 className="flex items-center gap-2 text-sm font-medium">
                    <TagsIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    {t("profile.field.skills")}
                  </h4>
                  <div className="flex flex-wrap gap-2" data-testid="work-experience-skills">
                    {experience.skillIds.map((skillId) => (
                      <ProfileSkillBadge
                        key={skillId}
                        name={skillsById.get(skillId) ?? skillId}
                        showIcon={false}
                      />
                    ))}
                  </div>
                </div>
              ),
            ].filter(Boolean)

            return (
              <li className="relative pl-7 sm:pl-10" key={experience.id}>
                {index < experiences.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-[2.1875rem] -bottom-[3.6875rem] left-[0.4375rem] w-px bg-border sm:left-[0.6875rem]"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="absolute top-7 left-0 z-10 flex size-3.5 items-center justify-center rounded-full border-4 border-background bg-primary ring-1 ring-primary/20 sm:left-1"
                  data-testid="work-experience-timeline-node"
                />
                <article
                  className="overflow-hidden rounded-xl border bg-card shadow-sm"
                  data-testid={`work-experience-item-${experience.id}`}
                >
                  <header className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary sm:size-12">
                      <BriefcaseBusinessIcon aria-hidden="true" className="size-5 sm:size-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-heading text-lg font-semibold">
                        {experience.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <Building2Icon aria-hidden="true" className="size-4 shrink-0" />
                            <span className="break-words">{experience.company}</span>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{employmentTypeLabel(experience.employmentType, t)}</span>
                          {experience.location && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{experience.location}</span>
                            </>
                          )}
                        </div>
                        <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDaysIcon aria-hidden="true" className="size-4 shrink-0" />
                          <DateRange
                            endDate={experience.endDate}
                            isCurrent={experience.isCurrent}
                            startDate={experience.startDate}
                          />
                        </span>
                      </div>
                    </div>
                  </header>
                  {details.length > 0 && (
                    <div
                      className={cn(
                        "grid gap-5 border-t p-4 sm:p-5",
                        details.length === 2 && "lg:grid-cols-2",
                        details.length === 3 &&
                          "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(13rem,0.75fr)]",
                      )}
                    >
                      {details.map((detail, index) => (
                        <div className={cn(index > 0 && "lg:border-l lg:pl-5")} key={index}>
                          {detail}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </li>
            )
          })}
        </ol>
      )}
    </ProfileSectionCard>
  )
}
