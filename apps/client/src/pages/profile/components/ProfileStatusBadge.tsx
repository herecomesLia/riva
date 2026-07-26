import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import type { ResumeProcessingStatus } from "@/models/profile"

export function ResumeProcessingBadge({ status }: { status: ResumeProcessingStatus }) {
  const { t } = useTranslation()

  return (
    <Badge variant={status === "failed" ? "destructive" : "secondary"}>
      {t(`profile.processingStatus.${status}`)}
    </Badge>
  )
}
