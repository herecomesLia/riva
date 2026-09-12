import { useTranslation } from "react-i18next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PracticeEvaluation } from "@/models/practice-workflow"

export function PracticeScoreOverview({ evaluation }: { evaluation: PracticeEvaluation }) {
  const { t } = useTranslation()

  return (
    <Card size="sm" data-testid="practice-score-overview">
      <CardHeader>
        <CardTitle>{t("practice.review.scoreTitle")}</CardTitle>
        <CardDescription>{t("practice.review.scoreDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="flex shrink-0 items-baseline gap-1"
          aria-label={t("practice.review.overallScore")}
        >
          <span className="font-heading text-4xl font-semibold tabular-nums">
            {evaluation.overallScore}
          </span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </div>
      </CardContent>
    </Card>
  )
}
