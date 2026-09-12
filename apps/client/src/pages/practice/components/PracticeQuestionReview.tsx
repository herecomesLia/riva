import { useTranslation } from "react-i18next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ReviewSession } from "@/models/practice-workflow"

import { PracticeFollowUpReview } from "./PracticeFollowUpReview"
import { PracticeReferenceAnswerContent } from "./PracticeReferenceAnswer"

type Props = Pick<ReviewSession, "question" | "followUps" | "followUpCompletion">

export function PracticeQuestionReview({ question, followUps, followUpCompletion }: Props) {
  const { t } = useTranslation()

  return (
    <Card data-testid="practice-question-review">
      <CardHeader>
        <CardTitle>
          <h2>{t("practice.questionReview.title")}</h2>
        </CardTitle>
        <CardDescription>{t("practice.questionReview.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-6">
        <section className="flex min-w-0 flex-col gap-4" data-testid="practice-reference-answer">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading font-medium">
              {t("practice.questionReview.mainQuestion")}
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("practice.referenceAnswer.description")}
            </p>
          </div>
          <PracticeReferenceAnswerContent
            headingLevel="h4"
            mode="review"
            state={question.referenceAnswer}
          />
        </section>
        <PracticeFollowUpReview completion={followUpCompletion} exchanges={followUps} />
      </CardContent>
    </Card>
  )
}
