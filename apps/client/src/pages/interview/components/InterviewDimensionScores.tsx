import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { InterviewReviewResponse, InterviewScoreDimension } from "@/models/interview"

export function InterviewDimensionScores({ review }: { review: InterviewReviewResponse }) {
  const { t } = useTranslation()
  const dimensionLabels: Record<InterviewScoreDimension, string> = {
    relevance: t("interview.review.dimensions.relevance"),
    structure: t("interview.review.dimensions.structure"),
    specificity: t("interview.review.dimensions.specificity"),
    personalContribution: t("interview.review.dimensions.personalContribution"),
    resultsAndEvidence: t("interview.review.dimensions.resultsAndEvidence"),
    roleAlignment: t("interview.review.dimensions.roleAlignment"),
    communication: t("interview.review.dimensions.communication"),
    riskControl: t("interview.review.dimensions.riskControl"),
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("interview.review.sections.dimensions")}</CardTitle>
        <CardDescription>{t("interview.review.dimensionDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {review.dimensionScores.map((dimension) => (
          <div
            className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4"
            key={dimension.dimension}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">{dimensionLabels[dimension.dimension]}</h3>
              <Badge variant="outline">
                {t("interview.review.score", { score: dimension.score })}
              </Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{dimension.explanation}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
