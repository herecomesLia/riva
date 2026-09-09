import { CodeXmlIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

type ProfileSkillBadgeProps = {
  showIcon?: boolean
  name: string
}

export function ProfileSkillBadge({ name, showIcon = true }: ProfileSkillBadgeProps) {
  return (
    <Badge
      className="h-auto min-h-6 max-w-full gap-1.5 rounded-md whitespace-normal break-words border-transparent bg-muted px-2.5 py-1 text-secondary-foreground"
      variant="outline"
    >
      {showIcon && <CodeXmlIcon aria-hidden="true" data-icon="inline-start" />}
      <span className="min-w-0 break-words">{name}</span>
    </Badge>
  )
}
