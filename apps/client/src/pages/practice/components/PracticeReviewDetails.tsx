import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PracticeReview } from "@/models/practice"

function ReviewList({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export function PracticeAnswerHighlights({ items }: { items: string[] }) {
  const { t } = useTranslation()
  return <ReviewSection items={items} title={t("practice.review.highlights")} />
}

export function PracticeAnswerIssues({ items }: { items: string[] }) {
  const { t } = useTranslation()
  return <ReviewSection items={items} title={t("practice.review.issues")} />
}

export function PracticeImprovementPlan({ items }: { items: string[] }) {
  const { t } = useTranslation()
  return <ReviewSection items={items} title={t("practice.review.improvements")} />
}

function ReviewSection({ items, title }: { items: string[]; title: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ReviewList items={items} />
      </CardContent>
    </Card>
  )
}

export function PracticeReusableStructure({ items }: { items: string[] }) {
  const { t } = useTranslation()

  return (
    <Card data-testid="practice-reusable-structure">
      <CardHeader>
        <CardTitle>{t("practice.review.reusableStructure")}</CardTitle>
        <CardDescription>{t("practice.review.reusableStructureDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <li className="flex min-w-0 items-start gap-2 rounded-xl bg-muted/60 p-3" key={item}>
              <Badge variant="outline">{index + 1}</Badge>
              <span className="wrap-break-word text-sm leading-6">{item}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

export function PracticeWeaknesses({ items }: { items: string[] }) {
  const { t } = useTranslation()

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("practice.review.weaknesses")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <Badge key={item} variant="secondary">
              {item}
            </Badge>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{t("practice.review.noNewWeaknesses")}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function PracticeReviewSummary({ review }: { review: PracticeReview }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3" data-testid="practice-review-summary">
      <PracticeAnswerHighlights items={review.highlights} />
      <PracticeAnswerIssues items={review.mainIssues} />
      <PracticeImprovementPlan items={review.improvementSuggestions} />
    </div>
  )
}
