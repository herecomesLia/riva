import { useTranslation } from "react-i18next"

import { Separator } from "@/components/ui/separator"
import type { JobProfile } from "@/models/profile"

import { ProfileSectionCard } from "./ProfileSectionCard"
import { ProfileSkillBadge } from "./ProfileSkillBadge"
import { DateRange, DetailList, EmptySection } from "./profile-section-shared"

export type ProjectExperienceCardProps = {
  onEdit: () => void
  projects: JobProfile["projectExperiences"]
  skills: JobProfile["skills"]
}

export function ProjectExperienceCard({ onEdit, projects, skills }: ProjectExperienceCardProps) {
  const { t } = useTranslation()
  const skillsById = new Map(skills.map((skill) => [skill.id, skill.name]))

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
              <div className="grid gap-5 lg:grid-cols-2">
                <DetailList
                  items={project.responsibilities}
                  title={t("profile.field.projectDescription")}
                />
                <DetailList
                  items={project.achievements}
                  title={t("profile.field.projectAchievements")}
                />
              </div>
              {project.skillIds.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-medium">{t("profile.field.technologyStack")}</h4>
                  <div className="flex flex-wrap gap-2" data-testid="project-experience-skills">
                    {project.skillIds.map((skillId) => (
                      <ProfileSkillBadge key={skillId} name={skillsById.get(skillId) ?? skillId} />
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
