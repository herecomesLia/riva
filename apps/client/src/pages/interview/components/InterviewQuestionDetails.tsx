import { useTranslation } from "react-i18next"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { InterviewQuestionDetail } from "@/models/interview-workflow"

import { InterviewAnswerAndPerformance } from "./InterviewAnswerAndPerformance"
import { InterviewFollowUpDetails } from "./InterviewFollowUpDetails"
import { InterviewReferenceAnswer } from "./InterviewReferenceAnswer"

export function InterviewQuestionDetails({ details }: { details: InterviewQuestionDetail[] }) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("interview.review.sections.questions")}</CardTitle>
        <CardDescription>{t("interview.review.questionDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion>
          {details.map((detail, index) => (
            <AccordionItem
              key={`${detail.questionOrder}-${index}`}
              value={`${detail.questionOrder}-${index}`}
            >
              <AccordionTrigger className="gap-3 no-underline hover:no-underline">
                <span className="flex min-w-0 flex-1 flex-col gap-1 pr-3">
                  <span className="text-xs font-normal text-muted-foreground">
                    {t("interview.review.mainQuestion", { order: detail.questionOrder })}
                  </span>
                  <span className="line-clamp-2 text-sm">{detail.prompt}</span>
                </span>
                {detail.performance ? (
                  <Badge className="shrink-0" variant="secondary">
                    {t("interview.review.score", { score: detail.performance.score })}
                  </Badge>
                ) : (
                  <Badge className="shrink-0" variant="outline">
                    {t("interview.review.unanswered")}
                  </Badge>
                )}
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-5">
                <InterviewAnswerAndPerformance
                  answer={detail.answer}
                  performance={detail.performance}
                />
                <InterviewReferenceAnswer referenceAnswer={detail.referenceAnswer} />
                {detail.followUps.length > 0 ? (
                  <InterviewFollowUpDetails followUps={detail.followUps} />
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}
