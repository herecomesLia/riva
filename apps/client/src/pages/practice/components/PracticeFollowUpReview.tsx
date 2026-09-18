import { useTranslation } from "react-i18next"

import type { ProcessingSession, PracticeFollowUp } from "@/models/practice-workflow"

import { PracticeReviewReferenceSections } from "./PracticeReviewReferenceSections"

type Props = {
  exchanges: ProcessingSession["followUps"]
}

export function PracticeFollowUpReview({ exchanges }: Props) {
  if (exchanges.length === 0) return null

  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-4" data-testid="practice-follow-up-review">
      {exchanges.map((exchange, index) => (
        <FollowUpReviewItem key={index} question={exchange.question} order={index + 1} />
      ))}
    </div>
  )
}

function FollowUpReviewItem({ question, order }: { order: number; question: PracticeFollowUp }) {
  const { t } = useTranslation()

  return (
    <article
      className="flex min-w-0 scroll-mt-24 flex-col gap-4 rounded-xl border bg-muted/30 p-4"
      data-review-index={order}
      tabIndex={-1}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <h3 className="min-w-0 font-heading font-medium">
          {t("practice.followUpReview.followUpNumber", { count: order })}
        </h3>
      </div>
      <PracticeReviewReferenceSections question={question} />
    </article>
  )
}
