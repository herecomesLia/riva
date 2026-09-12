import { useTranslation } from "react-i18next"
import type { Ref } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ReviewSession } from "@/models/practice-workflow"

import { PracticeFollowUpReview } from "./PracticeFollowUpReview"
import { PracticeReviewReferenceSections } from "./PracticeReferenceAnswer"

type Props = Pick<ReviewSession, "question" | "followUps" | "followUpCompletion"> & {
  scrollRef?: Ref<HTMLDivElement>
}

export function PracticeQuestionReview({
  question,
  followUps,
  followUpCompletion,
  scrollRef,
}: Props) {
  const { t } = useTranslation()

  return (
    <Card className="min-h-0 @4xl:h-full" data-testid="practice-question-review">
      <CardHeader className="shrink-0">
        <CardTitle>
          <h2>{t("practice.questionReview.title")}</h2>
        </CardTitle>
        <CardDescription>{t("practice.questionReview.description")}</CardDescription>
      </CardHeader>
      <CardContent
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={t("practice.questionReview.title")}
        className="flex min-h-0 min-w-0 flex-col gap-4 @4xl:overflow-y-auto @4xl:[scrollbar-gutter:stable]"
      >
        <section
          className="flex min-w-0 shrink-0 scroll-mt-24 flex-col gap-4 rounded-xl border bg-muted/30 p-4"
          data-testid="practice-reference-answer"
          data-review-index={0}
          tabIndex={-1}
        >
          <div className="flex min-w-0 items-start justify-between gap-3">
            <h3 className="min-w-0 font-heading font-medium">
              {t("practice.questionReview.mainQuestion")}
            </h3>
            {question.referenceAnswer.status === "revealed" && (
              <Badge className="shrink-0" variant="outline">
                {question.referenceAnswer.viewedBeforeSubmission
                  ? t("practice.referenceAnswer.viewedBeforeSubmission")
                  : t("practice.referenceAnswer.notViewedBeforeSubmission")}
              </Badge>
            )}
          </div>
          {question.referenceAnswer.status === "revealed" &&
            question.referenceAnswer.content.kind === "technicalReference" && (
              <Badge className="self-start" variant="secondary">
                {t("practice.referenceAnswer.kind.technicalReference")}
              </Badge>
            )}
          <PracticeReviewReferenceSections question={question} />
        </section>
        <PracticeFollowUpReview completion={followUpCompletion} exchanges={followUps} />
      </CardContent>
    </Card>
  )
}
