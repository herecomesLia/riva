import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PracticeEvaluation } from "@/models/practice-workflow"

export function PracticeScoreOverview({
  evaluation,
  overallPerformance,
}: {
  evaluation: PracticeEvaluation
  overallPerformance: string
}) {
  const { t } = useTranslation()

  return (
    <Card data-testid="practice-score-overview">
      <CardHeader>
        <CardTitle>{t("practice.review.scoreTitle")}</CardTitle>
        <CardDescription>{t("practice.review.scoreDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div
          className="flex shrink-0 items-baseline gap-1"
          aria-label={t("practice.review.overallScore")}
        >
          <span className="font-heading text-5xl font-semibold tabular-nums">
            {evaluation.overallScore}
          </span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Badge variant="secondary">{t("practice.review.completed")}</Badge>
          <p className="font-medium">{t("practice.review.overallPerformance")}</p>
          <p className="text-sm leading-6">{overallPerformance}</p>
        </div>
      </CardContent>
    </Card>
  )
}
