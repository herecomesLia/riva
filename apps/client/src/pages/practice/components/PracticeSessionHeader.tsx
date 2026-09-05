import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import type { ActiveSelection, PracticeSetupContext } from "@/models/practice-workflow"

type PracticeSessionHeaderProps = {
  context: PracticeSetupContext
  selection: ActiveSelection
}

export function PracticeSessionHeader({ context, selection }: PracticeSessionHeaderProps) {
  const { t } = useTranslation()
  const role = context.targetRoles.find((candidate) => candidate.id === selection.targetRoleId)

  return (
    <header className="flex flex-col gap-3" data-testid="practice-session-header">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">{t("practice.session.eyebrow")}</p>
        <h2 className="font-heading text-2xl font-semibold leading-tight">
          {role?.title ?? t("practice.session.unknownRole")}
        </h2>
        {role?.company ? <p className="text-sm text-muted-foreground">{role.company}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-primary text-primary-foreground">
          {t(`practice.questionTypes.${selection.questionType}`)}
        </Badge>
        <Badge className="border-primary/20 bg-primary/10 text-primary" variant="outline">
          {t(`practice.difficulty.${selection.difficulty}`)}
        </Badge>
      </div>
    </header>
  )
}
