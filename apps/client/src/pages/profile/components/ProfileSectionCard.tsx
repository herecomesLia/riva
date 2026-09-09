import { PencilIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type ProfileSection = "education" | "workExperience" | "projectExperience" | "skills"

type ProfileSectionCardProps = {
  children: ReactNode
  className?: string
  contentClassName?: string
  description?: string
  onEdit?: () => void
  section: ProfileSection
}

export function ProfileSectionCard({
  children,
  className,
  contentClassName,
  description,
  onEdit,
  section,
}: ProfileSectionCardProps) {
  const { t } = useTranslation()

  return (
    <Card className={cn(className)} data-testid={`profile-section-${section}`}>
      <CardHeader>
        <CardTitle>
          <h2>{t(`profile.sections.${section}`)}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          <Button disabled={!onEdit} onClick={onEdit} size="sm" variant="ghost">
            <PencilIcon data-icon="inline-start" />
            {t("profile.actions.edit")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className={cn(contentClassName)}>{children}</CardContent>
    </Card>
  )
}
