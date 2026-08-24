import { useTranslation } from "react-i18next"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ProfileContent, ProfileSection } from "@/models/profile"

import { EducationCard } from "./EducationCard"
import { ProjectExperienceCard } from "./ProjectExperienceCard"
import { SkillsCard } from "./SkillsCard"
import { WorkExperienceCard } from "./WorkExperienceCard"

type ProfileSectionsProps = {
  onStartEditing: (section: ProfileSection) => void
  profile: ProfileContent
}

export function ProfileSections({ onStartEditing, profile }: ProfileSectionsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      {profile.summary && (
        <Card data-testid="profile-summary">
          <CardHeader>
            <CardTitle>
              <h2>{t("profile.sections.summary")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{profile.summary}</p>
          </CardContent>
        </Card>
      )}
      <section
        className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]"
        data-testid="profile-summary-sections"
      >
        <EducationCard education={profile.education} onEdit={() => onStartEditing("education")} />
        <SkillsCard onEdit={() => onStartEditing("skills")} skills={profile.skills} />
      </section>
      <WorkExperienceCard
        experiences={profile.workExperiences}
        onEdit={() => onStartEditing("workExperience")}
      />
      <ProjectExperienceCard
        onEdit={() => onStartEditing("projectExperience")}
        projects={profile.projectExperiences}
      />
    </div>
  )
}
