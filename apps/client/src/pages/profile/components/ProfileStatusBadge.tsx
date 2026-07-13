import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import type { ProfileReviewStatus, ProfileStatus, ResumeProcessingStatus } from "@/models/profile"

type ProfileStatusBadgeProps = {
  status: ProfileStatus
}

export function ProfileStatusBadge({ status }: ProfileStatusBadgeProps) {
  const { t } = useTranslation()

  return (
    <Badge variant={status === "recognitionFailed" ? "destructive" : "secondary"}>
      {t(`profile.status.${status}`)}
    </Badge>
  )
}

export function ResumeProcessingBadge({ status }: { status: ResumeProcessingStatus }) {
  const { t } = useTranslation()

  return (
    <Badge variant={status === "failed" ? "destructive" : "secondary"}>
      {t(`profile.processingStatus.${status}`)}
    </Badge>
  )
}

export function ReviewStatusBadge({ status }: { status: ProfileReviewStatus }) {
  const { t } = useTranslation()
  const variant =
    status === "needsReview" ? "secondary" : status === "incomplete" ? "outline" : "outline"

  return <Badge variant={variant}>{t(`profile.reviewStatus.${status}`)}</Badge>
}
