import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeXmlIcon,
  GraduationCapIcon,
  PencilIcon,
} from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { JobProfile, ProfileSection } from "@/models/profile"

import type { EditableProfileSection } from "./ProfileSectionEditDialog"
import { employmentTypeLabel, formatMonth } from "./profile-formatters"

type ProfileSectionsProps = {
  onStartEditing: (section: EditableProfileSection) => void
  profile: JobProfile
}

function ReadonlySectionCard({
  children,
  className,
  contentClassName,
  description,
  onEdit,
  section,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
  description?: string
  onEdit?: () => void
  section: ProfileSection
}) {
  const { t } = useTranslation()

  return (
    <Card className={cn(className)} data-testid={`profile-section-${section}`}>
      <CardHeader>
        <CardTitle>
          <h2>{t(`profile.sections.${section}`)}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          <Button disabled={!onEdit} onClick={onEdit} size="sm" variant="outline">
            <PencilIcon className="size-4" data-icon="inline-start" />
            {t("profile.actions.edit")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className={cn(contentClassName)}>{children}</CardContent>
    </Card>
  )
}

function EmptySection() {
  const { t } = useTranslation()

  return (
    <Empty className="min-h-36 p-6">
      <EmptyHeader>
        <EmptyTitle>{t("profile.emptySection")}</EmptyTitle>
        <EmptyDescription>{t("profile.emptySection")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function DateRange({
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
    <p className="text-sm text-muted-foreground">
      {t("profile.field.dateRange", {
        end,
        start,
      })}
    </p>
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
      <CalendarDaysIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 break-words">
        {t("profile.field.dateRange", {
          end,
          start,
        })}
      </span>
    </div>
  )
}

function DetailList({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">{title}</h4>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

type ProfileItemCarouselProps<T> = {
  getItemKey: (item: T) => string
  itemCardClassName?: string
  items: T[]
  renderItem: (item: T) => ReactNode
  sectionLabel: string
}

const carouselArrowClassName =
  "pointer-events-auto bg-transparent opacity-40 transition-opacity hover:bg-transparent hover:opacity-100 focus-visible:bg-transparent focus-visible:opacity-100 active:!translate-y-0 active:bg-transparent dark:hover:bg-transparent dark:focus-visible:bg-transparent"

function ProfileItemCarousel<T>({
  getItemKey,
  itemCardClassName,
  items,
  renderItem,
  sectionLabel,
}: ProfileItemCarouselProps<T>) {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(items.length - 1, 0)))
  }, [items.length])

  if (items.length === 0) {
    return null
  }

  const safeIndex = Math.min(currentIndex, items.length - 1)
  const currentItem = items[safeIndex]
  const hasMultipleItems = items.length > 1
  const canGoPrevious = safeIndex > 0
  const canGoNext = safeIndex < items.length - 1

  function showPrevious() {
    setCurrentIndex((index) => Math.max(0, index - 1))
  }

  function showNext() {
    setCurrentIndex((index) => Math.min(items.length - 1, index + 1))
  }

  return (
    <div
      className={cn(
        "relative flex flex-1 rounded-xl border bg-background/60 py-4",
        hasMultipleItems ? "px-11" : "px-4",
        itemCardClassName,
      )}
    >
      <div aria-live="polite" className="min-w-0 flex-1" key={getItemKey(currentItem)}>
        {renderItem(currentItem)}
      </div>
      {canGoPrevious && (
        <div className="pointer-events-none absolute inset-y-0 left-2 flex items-center">
          <Button
            aria-label={t("profile.carousel.previous", { section: sectionLabel })}
            className={carouselArrowClassName}
            onClick={showPrevious}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronLeftIcon />
          </Button>
        </div>
      )}
      {canGoNext && (
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <Button
            aria-label={t("profile.carousel.next", { section: sectionLabel })}
            className={carouselArrowClassName}
            onClick={showNext}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </div>
  )
}

export function ProfileSections({ onStartEditing, profile }: ProfileSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <section
        className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]"
        data-testid="profile-summary-sections"
      >
        <EducationSection onStartEditing={onStartEditing} profile={profile} />
        <SkillsSection onStartEditing={onStartEditing} profile={profile} />
      </section>
      <WorkExperienceSection onStartEditing={onStartEditing} profile={profile} />
      <ProjectExperienceSection onStartEditing={onStartEditing} profile={profile} />
    </div>
  )
}

function EducationSection({ onStartEditing, profile }: ProfileSectionsProps) {
  const { t } = useTranslation()

  return (
    <ReadonlySectionCard
      className="h-full [--card-spacing:--spacing(4)]"
      contentClassName="flex flex-1 flex-col"
      onEdit={() => onStartEditing("education")}
      section="education"
    >
      {profile.education.length === 0 ? (
        <EmptySection />
      ) : (
        <ProfileItemCarousel
          getItemKey={(education) => education.id}
          itemCardClassName="border-border bg-card py-4"
          items={profile.education}
          renderItem={(education) => {
            const degreeMajor = [education.degree, education.major].filter(Boolean).join(" · ")

            return (
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:size-12">
                  <GraduationCapIcon aria-hidden="true" className="size-5 sm:size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-heading text-base leading-5 font-semibold text-foreground">
                    {education.school}
                  </h3>
                  {degreeMajor && (
                    <p className="mt-0.5 break-words text-sm leading-5 text-muted-foreground">
                      {degreeMajor}
                    </p>
                  )}
                  <div className="mt-2">
                    <EducationDateRange
                      endDate={education.endDate}
                      isCurrent={education.isCurrent}
                      startDate={education.startDate}
                    />
                  </div>
                </div>
              </div>
            )
          }}
          sectionLabel={t("profile.sections.education")}
        />
      )}
    </ReadonlySectionCard>
  )
}

function WorkExperienceSection({ onStartEditing, profile }: ProfileSectionsProps) {
  const { t } = useTranslation()

  const skillsById = new Map(profile.skills.map((skill) => [skill.id, skill.name]))

  return (
    <ReadonlySectionCard onEdit={() => onStartEditing("workExperience")} section="workExperience">
      {profile.workExperiences.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="flex flex-col gap-6">
          {profile.workExperiences.map((experience, index) => (
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
    </ReadonlySectionCard>
  )
}

function ProjectExperienceSection({ onStartEditing, profile }: ProfileSectionsProps) {
  const { t } = useTranslation()

  const workExperienceById = new Map(
    profile.workExperiences.map((experience) => [experience.id, experience.company]),
  )

  return (
    <ReadonlySectionCard
      onEdit={() => onStartEditing("projectExperience")}
      section="projectExperience"
    >
      {profile.projectExperiences.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="flex flex-col gap-6">
          {profile.projectExperiences.map((project, index) => (
            <article key={project.id} className="flex flex-col gap-4">
              {index > 0 && <Separator />}
              <div className="flex flex-col gap-1">
                <h3 className="font-heading text-lg font-medium">{project.name}</h3>
                {project.role && <p className="text-sm text-muted-foreground">{project.role}</p>}
                <DateRange
                  endDate={project.endDate}
                  isCurrent={project.endDate === null}
                  startDate={project.startDate}
                />
              </div>
              {project.background && (
                <p className="text-sm leading-6 text-muted-foreground">{project.background}</p>
              )}
              {project.relatedWorkExperienceId &&
                workExperienceById.get(project.relatedWorkExperienceId) && (
                  <p className="text-sm text-muted-foreground">
                    {workExperienceById.get(project.relatedWorkExperienceId)}
                  </p>
                )}
              <div className="grid gap-5 lg:grid-cols-3">
                <DetailList
                  items={project.responsibilities}
                  title={t("profile.field.responsibilities")}
                />
                <DetailList
                  items={project.contributions}
                  title={t("profile.field.contributions")}
                />
                <DetailList items={project.achievements} title={t("profile.field.achievements")} />
              </div>
              {project.technologies.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {project.technologies.map((technology) => (
                    <Badge key={technology} variant="outline">
                      {technology}
                    </Badge>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </ReadonlySectionCard>
  )
}

function SkillsSection({ onStartEditing, profile }: ProfileSectionsProps) {
  return (
    <ReadonlySectionCard
      className="h-full [--card-spacing:--spacing(4)]"
      contentClassName="flex flex-1 flex-col"
      onEdit={() => onStartEditing("skills")}
      section="skills"
    >
      {profile.skills.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="flex flex-wrap gap-2">
          {profile.skills.map((skill) => (
            <Badge
              className="h-auto min-h-6 max-w-full gap-1.5 whitespace-normal break-words border-primary/20 bg-primary/10 px-2.5 py-1 text-primary hover:bg-primary/15"
              key={skill.id}
              variant="outline"
            >
              <CodeXmlIcon aria-hidden="true" data-icon="inline-start" />
              <span className="min-w-0 break-words">{skill.name}</span>
            </Badge>
          ))}
        </div>
      )}
    </ReadonlySectionCard>
  )
}
