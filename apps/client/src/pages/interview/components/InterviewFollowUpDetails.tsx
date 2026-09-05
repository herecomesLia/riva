import { useTranslation } from "react-i18next"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import type { InterviewFollowUpDetail } from "@/models/interview-workflow"

import { InterviewAnswerAndPerformance } from "./InterviewAnswerAndPerformance"
import { InterviewReferenceAnswer } from "./InterviewReferenceAnswer"

export function InterviewFollowUpDetails({ followUps }: { followUps: InterviewFollowUpDetail[] }) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-medium">{t("interview.review.followUpQuestions")}</h4>
      <Accordion className="rounded-lg border px-4">
        {followUps.map((followUp, index) => (
          <AccordionItem key={String(index)} value={String(index)}>
            <AccordionTrigger className="gap-3 no-underline hover:no-underline">
              <span className="min-w-0 flex-1 text-left">{followUp.prompt}</span>
              <Badge variant={followUp.answer !== null ? "secondary" : "outline"}>
                {followUp.answer !== null
                  ? t("interview.review.answered")
                  : t("interview.review.unanswered")}
              </Badge>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4">
              <InterviewAnswerAndPerformance
                answer={followUp.answer}
                performance={followUp.performance}
              />
              <InterviewReferenceAnswer referenceAnswer={followUp.referenceAnswer} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
