import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type {
  EvaluatingSession,
  FollowUpCompletion,
  PracticeFollowUp,
} from "@/models/practice-workflow"

type Props = {
  exchanges: EvaluatingSession["followUps"]
  completion: FollowUpCompletion
}

export function PracticeFollowUpReview({ exchanges, completion }: Props) {
  const { t } = useTranslation()
  const unanswered = completion.status === "endedEarly" ? completion.unanswered : undefined
  if (exchanges.length === 0 && !unanswered) return null

  return (
    <section
      className="flex min-w-0 flex-col gap-4 border-t pt-6"
      data-testid="practice-follow-up-review"
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-heading font-medium">{t("practice.followUpReview.title")}</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("practice.followUpReview.description")}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-5 divide-y">
        {exchanges.map((exchange, index) => (
          <FollowUpReviewItem
            answer={exchange.answer.content}
            key={index}
            question={exchange.question}
            order={index + 1}
          />
        ))}
        {unanswered ? (
          <FollowUpReviewItem question={unanswered} order={exchanges.length + 1} />
        ) : null}
      </div>
    </section>
  )
}

function FollowUpReviewItem({
  answer,
  question,
  order,
}: {
  order: number
  answer?: string
  question: PracticeFollowUp
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const reference = question.referenceAnswer

  return (
    <article className="flex min-w-0 flex-col gap-4 not-first:pt-5">
      <div className="flex min-w-0 flex-col gap-2">
        <h4 className="font-heading font-medium">
          {t("practice.followUpReview.followUpNumber", { count: order })}
        </h4>
        <p className="break-words text-sm leading-6 [overflow-wrap:anywhere]">{question.prompt}</p>
      </div>
      <section className="flex min-w-0 flex-col gap-2">
        <h5 className="font-heading text-sm font-medium">
          {t("practice.followUpReview.yourAnswer")}
        </h5>
        <p className="break-words text-sm leading-6 [overflow-wrap:anywhere]">
          {answer ?? t("practice.followUpAssistance.unanswered")}
        </p>
      </section>
      {reference.status === "revealed" ? (
        <Collapsible onOpenChange={setExpanded} open={expanded}>
          <div className="flex min-w-0 flex-col gap-3">
            <section className="flex min-w-0 flex-col gap-2">
              <h5 className="font-heading text-sm font-medium">
                {t("practice.followUpReview.assistanceUsed")}
              </h5>
              <div className="flex flex-wrap gap-2">
                {reference.content.kind === "technicalReference" && (
                  <Badge variant="secondary">
                    {t("practice.followUpAssistance.kind.technicalReference")}
                  </Badge>
                )}
                <Badge variant="outline">
                  {reference.viewedBeforeSubmission
                    ? t("practice.followUpAssistance.viewedBeforeSubmission")
                    : t("practice.followUpReview.notViewedBeforeSubmission")}
                </Badge>
              </div>
            </section>
            <CollapsibleTrigger
              aria-label={
                expanded
                  ? t("practice.followUpReview.collapseReference")
                  : t("practice.followUpReview.expandReference")
              }
              render={<Button size="sm" variant="outline" />}
            >
              <ChevronDownIcon data-icon="inline-start" />
              {expanded
                ? t("practice.followUpReview.collapseReference")
                : t("practice.followUpReview.expandReference")}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="flex min-w-0 flex-col gap-4 break-words [overflow-wrap:anywhere]">
                <p className="text-sm text-muted-foreground">{reference.content.addressedGap}</p>
                <p className="whitespace-pre-wrap text-sm leading-7">{reference.content.answer}</p>
                <ReviewList
                  items={reference.content.keyPoints}
                  title={t("practice.followUpAssistance.keyPoints")}
                />
                <ReviewList
                  items={reference.content.commonMistakes}
                  title={t("practice.followUpAssistance.commonMistakes")}
                />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("practice.followUpAssistance.unavailable")}
        </p>
      )}
    </article>
  )
}

function ReviewList({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h5 className="font-heading text-sm font-medium">{title}</h5>
      <ul className="list-disc pl-5 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
