import {
  CalendarDaysIcon,
  ChartColumnIncreasingIcon,
  CodeXmlIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  NotebookPenIcon,
  UserRoundIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { ProjectEntryResponse } from "@/api/generated/models"
import { cn } from "@/lib/utils"

import { ProfileSectionCard } from "./ProfileSectionCard"
import { ProfileSkillBadge } from "./ProfileSkillBadge"
import { DateRange, DetailList, EmptySection } from "./profile-section-shared"

export type ProjectExperienceCardProps = {
  onEdit: () => void
  projects: ProjectEntryResponse[]
}

type ProjectDetail = {
  content: ReactNode
  key: "description" | "achievements" | "techStack"
}

export function ProjectExperienceCard({ onEdit, projects }: ProjectExperienceCardProps) {
  const { t } = useTranslation()

  return (
    <ProfileSectionCard onEdit={onEdit} section="projectExperience">
      {projects.length === 0 ? (
        <EmptySection />
      ) : (
        <ol className="relative flex flex-col gap-6">
          {projects.map((project, index) => {
            const details: ProjectDetail[] = [
              ...(project.description.length > 0
                ? [
                    {
                      content: (
                        <DetailList
                          icon={NotebookPenIcon}
                          items={project.description}
                          title={t("profile.field.projectDescription")}
                        />
                      ),
                      key: "description" as const,
                    },
                  ]
                : []),
              ...(project.achievements.length > 0
                ? [
                    {
                      content: (
                        <DetailList
                          icon={ChartColumnIncreasingIcon}
                          items={project.achievements}
                          title={t("profile.field.projectAchievements")}
                        />
                      ),
                      key: "achievements" as const,
                    },
                  ]
                : []),
              ...(project.techStack.length > 0
                ? [
                    {
                      content: (
                        <div className="flex flex-col gap-2">
                          <h4 className="flex items-center gap-2 text-sm font-medium">
                            <CodeXmlIcon
                              aria-hidden="true"
                              className="size-4 shrink-0 text-primary"
                            />
                            {t("profile.field.techStack")}
                          </h4>
                          <div
                            className="flex flex-wrap gap-2"
                            data-testid="project-experience-technologies"
                          >
                            {project.techStack.map((technology) => (
                              <ProfileSkillBadge
                                key={technology}
                                name={technology}
                                showIcon={false}
                              />
                            ))}
                          </div>
                        </div>
                      ),
                      key: "techStack" as const,
                    },
                  ]
                : []),
            ]

            return (
              <li
                className="relative pl-7 sm:pl-10"
                key={`${project.name}-${project.startDate}-${index}`}
              >
                {index < projects.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-[2.1875rem] -bottom-[3.6875rem] left-[0.4375rem] w-px bg-border sm:left-[0.6875rem]"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="absolute top-7 left-0 z-10 flex size-3.5 items-center justify-center rounded-full border-4 border-background bg-primary ring-1 ring-primary/20 sm:left-1"
                  data-testid="project-experience-timeline-node"
                />
                <article
                  className="overflow-hidden rounded-xl border bg-card"
                  data-testid={`project-experience-item-${index}`}
                >
                  <header className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary sm:size-12">
                      <FolderOpenIcon aria-hidden="true" className="size-5 sm:size-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-heading text-lg font-semibold">
                        {project.name}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        {project.role && (
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <UserRoundIcon aria-hidden="true" className="size-4 shrink-0" />
                            <span className="break-words">{project.role}</span>
                          </span>
                        )}
                        {project.role && (
                          <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
                        )}
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDaysIcon aria-hidden="true" className="size-4 shrink-0" />
                          <DateRange endDate={project.endDate} startDate={project.startDate} />
                        </span>
                      </div>
                      {project.url && (
                        <a
                          className="mt-2 inline-flex max-w-full items-center gap-1.5 break-all text-sm text-primary underline-offset-4 hover:underline"
                          href={project.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0" />
                          {t("profile.actions.openProject")}
                        </a>
                      )}
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
                      data-testid={`project-experience-details-${index}`}
                    >
                      {details.map((detail, detailIndex) => (
                        <div
                          className={cn(detailIndex > 0 && "lg:border-l lg:pl-5")}
                          key={detail.key}
                        >
                          {detail.content}
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
