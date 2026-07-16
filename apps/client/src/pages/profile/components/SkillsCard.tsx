import { CodeXmlIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { JobProfile } from "@/models/profile"

import { ProfileSectionCard } from "./ProfileSectionCard"
import { EmptySection } from "./profile-section-shared"

export type SkillsCardProps = {
  onEdit: () => void
  skills: JobProfile["skills"]
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
    </ProfileSectionCard>
  )
}
