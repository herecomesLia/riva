import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PracticeRecommendation } from "@/models/practice"

export function PracticeRecommendationCard({
  recommendation,
}: {
  recommendation: PracticeRecommendation
}) {
  const { t } = useTranslation()
  const isRetry = recommendation.action === "retryCurrent"

  return (
    <Card data-testid="practice-recommendation">
      <CardHeader>
        <CardTitle>
          {isRetry ? t("practice.review.retryRecommended") : t("practice.review.nextRecommended")}
        </CardTitle>
        <CardDescription>{recommendation.reason}</CardDescription>
      </CardHeader>
      {!isRetry && (
        <CardContent className="flex flex-wrap gap-2">
          <Badge>{t(`practice.questionTypes.${recommendation.nextQuestion.questionType}`)}</Badge>
          <Badge variant="outline">
            {t(`practice.difficulty.${recommendation.nextQuestion.difficulty}`)}
          </Badge>
          {recommendation.nextQuestion.focusAreas.map((area) => (
            <Badge key={area} variant="secondary">
              {area}
            </Badge>
          ))}
        </CardContent>
      )}
    </Card>
  )
}
