import { ProfileSectionCard } from "./ProfileSectionCard"
import { ProfileSkillBadge } from "./ProfileSkillBadge"
import { EmptySection } from "./profile-section-shared"

export type SkillsCardProps = {
  onEdit: () => void
  skills: string[]
}

export function SkillsCard({ onEdit, skills }: SkillsCardProps) {
  return (
    <ProfileSectionCard
      className="h-full [--card-spacing:--spacing(4)]"
      contentClassName="flex flex-1 flex-col"
      onEdit={onEdit}
      section="skills"
    >
      {skills.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <ProfileSkillBadge key={skill} name={skill} />
          ))}
        </div>
      )}
    </ProfileSectionCard>
  )
}
