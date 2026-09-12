import { Link } from "@tanstack/react-router"
import { PlayIcon, SparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { mapTrainingRecommendationToEntry } from "@/app/training-recommendation-entry"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { TrainingRecordRecommendation } from "@/models/training-records"

export function TrainingRecommendationCard({
  recommendation,
  showIcon = false,
  size,
  roleId,
  title,
}: {
  recommendation: TrainingRecordRecommendation | null
  showIcon?: boolean
  size?: "sm"
  roleId: string
  title: string
}) {
  const { t } = useTranslation()
  const entry = mapTrainingRecommendationToEntry(recommendation, roleId)

  return (
    <Card size={size}>
      <CardHeader>
        <CardTitle className={showIcon ? "flex items-center gap-2" : undefined}>
          {showIcon && <SparklesIcon aria-hidden="true" />}
          {title}
        </CardTitle>
        <CardDescription>
          {recommendation?.reason ?? t("history.detail.recommendationNone")}
        </CardDescription>
      </CardHeader>
      {recommendation && recommendation.action !== "none" && (
        <CardContent className="flex flex-wrap gap-2">
          {recommendation.focusAreas.map((area) => (
            <Badge key={area} variant="secondary">
              {area}
            </Badge>
          ))}
        </CardContent>
      )}
      {entry && (
        <CardFooter>
          <Link
            className={buttonVariants({
              size,
              className: "h-auto min-h-9 max-w-full whitespace-normal py-2 text-center",
            })}
            search={entry.search}
            to={entry.to}
          >
            <PlayIcon aria-hidden="true" data-icon="inline-start" />
            {t(`history.detail.recommendationActions.${entry.action}`)}
          </Link>
        </CardFooter>
      )}
    </Card>
  )
}
