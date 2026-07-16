import { CodeXmlIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

type ProfileSkillBadgeProps = {
  name: string
}

export function ProfileSkillBadge({ name }: ProfileSkillBadgeProps) {
  return (
    <Badge
      className="h-auto min-h-6 max-w-full gap-1.5 whitespace-normal break-words border-primary/20 bg-primary/10 px-2.5 py-1 text-primary hover:bg-primary/15"
      variant="outline"
    >
      <CodeXmlIcon aria-hidden="true" data-icon="inline-start" />
      <span className="min-w-0 break-words">{name}</span>
    </Badge>
  )
}
