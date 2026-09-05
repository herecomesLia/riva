import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DimensionScore } from "@/models/practice-workflow"

export function PracticeDimensionScores({ scores }: { scores: DimensionScore[] }) {
  const { t } = useTranslation()

  return (
    <Card data-testid="practice-dimension-scores">
      <CardHeader>
        <CardTitle>{t("practice.review.dimensionsTitle")}</CardTitle>
        <CardDescription>{t("practice.review.dimensionsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          {scores.map((item) => (
            <div
              className="flex min-w-0 flex-col gap-2 rounded-xl bg-muted/60 p-4"
              key={item.dimension}
            >
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium">{t(`practice.scoreDimensions.${item.dimension}`)}</dt>
                <Badge variant="outline">
                  {t("practice.review.dimensionScore", { score: item.score })}
                </Badge>
              </div>
              <dd className="text-sm leading-6 text-muted-foreground">{item.explanation}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
