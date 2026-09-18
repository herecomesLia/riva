import { useTranslation } from "react-i18next"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PracticeReview } from "@/models/practice-workflow"

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

export function PracticeReviewSummary({ review }: { review: PracticeReview }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3" data-testid="practice-review-summary">
      <PracticeAnswerHighlights items={review.highlights} />
      <PracticeAnswerIssues items={review.mainIssues} />
      <PracticeImprovementPlan items={review.improvementSuggestions} />
    </div>
  )
}
