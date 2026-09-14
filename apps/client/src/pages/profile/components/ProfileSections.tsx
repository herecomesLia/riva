import type { CareerProfileResponse } from "@/api/generated/models"

import { EducationCard } from "./EducationCard"
import { ProjectExperienceCard } from "./ProjectExperienceCard"
import type { EditableProfileSection } from "./ProfileSectionEditDialog"
import { SkillsCard } from "./SkillsCard"
import { WorkExperienceCard } from "./WorkExperienceCard"

type ProfileSectionsProps = {
  onStartEditing?: (section: EditableProfileSection) => void
  profile: CareerProfileResponse
}

export function ProfileSections({ onStartEditing, profile }: ProfileSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <section
        className="grid items-stretch gap-6 @3xl/app:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]"
        data-testid="profile-summary-sections"
      >
        <EducationCard
          education={profile.education}
          onEdit={onStartEditing ? () => onStartEditing("education") : undefined}
        />
        <SkillsCard
          onEdit={onStartEditing ? () => onStartEditing("skills") : undefined}
          skills={profile.skills}
        />
      </section>
      <WorkExperienceCard
        experiences={profile.workExperiences}
        onEdit={onStartEditing ? () => onStartEditing("workExperience") : undefined}
      />
      <ProjectExperienceCard
        onEdit={onStartEditing ? () => onStartEditing("projectExperience") : undefined}
        projects={profile.projects}
      />
    </div>
  )
}
