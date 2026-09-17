import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import type {
  ProcessingSession,
  FollowUpCompletion,
  PracticeFollowUp,
} from "@/models/practice-workflow"

import { PracticeReviewReferenceSections } from "./PracticeReviewReferenceSections"

type Props = {
  exchanges: ProcessingSession["followUps"]
  completion: FollowUpCompletion
}

export function PracticeFollowUpReview({ exchanges, completion }: Props) {
  const unanswered = completion.status === "endedEarly" ? completion.unanswered : undefined
  if (exchanges.length === 0 && !unanswered) return null

  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-4" data-testid="practice-follow-up-review">
      {exchanges.map((exchange, index) => (
        <FollowUpReviewItem key={index} question={exchange.question} order={index + 1} />
      ))}
      {unanswered && (
        <FollowUpReviewItem question={unanswered} order={exchanges.length + 1} unanswered />
      )}
    </div>
  )
}

function FollowUpReviewItem({
  question,
  order,
  unanswered = false,
}: {
  order: number
  question: PracticeFollowUp
  unanswered?: boolean
}) {
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
      {unanswered && <Badge variant="outline">{t("practice.followUpAssistance.unanswered")}</Badge>}
      <PracticeReviewReferenceSections question={question} />
    </article>
  )
}
