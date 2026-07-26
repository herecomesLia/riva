import { useTranslation } from "react-i18next"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import type { InterviewFollowUpLearningDetailResponse } from "@/models/interview"

import { InterviewAnswerAndPerformance } from "./InterviewAnswerAndPerformance"
import { InterviewReferenceAnswer } from "./InterviewReferenceAnswer"

export function InterviewFollowUpDetails({
  followUps,
}: {
  followUps: InterviewFollowUpLearningDetailResponse[]
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-medium">{t("interview.review.followUpQuestions")}</h4>
      <Accordion className="rounded-lg border px-4">
        {followUps.map((followUp) => (
          <AccordionItem key={followUp.record.question.id} value={followUp.record.question.id}>
            <AccordionTrigger className="gap-3 no-underline hover:no-underline">
              <span className="min-w-0 flex-1 text-left">{followUp.record.question.prompt}</span>
              <Badge variant={followUp.record.status === "answered" ? "secondary" : "outline"}>
                {followUp.record.status === "answered"
                  ? t("interview.review.answered")
                  : t("interview.review.unanswered")}
              </Badge>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4">
              <InterviewAnswerAndPerformance
                answer={followUp.record.answer?.content ?? null}
                performance={followUp.performance}
              />
              <InterviewReferenceAnswer
                id={followUp.record.question.id}
                referenceAnswer={followUp.referenceAnswer}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
