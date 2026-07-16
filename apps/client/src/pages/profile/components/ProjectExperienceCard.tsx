import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { JobProfile } from "@/models/profile"

import { ProfileSectionCard } from "./ProfileSectionCard"
import { DateRange, DetailList, EmptySection } from "./profile-section-shared"

export type ProjectExperienceCardProps = {
  onEdit: () => void
  projects: JobProfile["projectExperiences"]
  workExperiences: JobProfile["workExperiences"]
}

export function ProjectExperienceCard({
  onEdit,
  projects,
  workExperiences,
}: ProjectExperienceCardProps) {
  const { t } = useTranslation()
  const workExperienceById = new Map(
    workExperiences.map((experience) => [experience.id, experience.company]),
  )

  return (
    <ProfileSectionCard onEdit={onEdit} section="projectExperience">
      {projects.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="flex flex-col gap-6">
          {projects.map((project, index) => (
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
    </ProfileSectionCard>
  )
}
