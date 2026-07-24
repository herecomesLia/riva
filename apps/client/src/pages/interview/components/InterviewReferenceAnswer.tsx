import { BookOpenTextIcon, LightbulbIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { InterviewReferenceAnswerResponse } from "@/models/interview"

export function InterviewReferenceAnswer({
  id,
  referenceAnswer,
}: {
  id: string
  referenceAnswer: InterviewReferenceAnswerResponse
}) {
  const { t } = useTranslation()
  if (referenceAnswer.status !== "ready") {
    return (
      <Alert>
        <BookOpenTextIcon aria-hidden="true" />
        <AlertTitle>
          {referenceAnswer.status === "generating"
            ? t("interview.review.reference.generating")
            : t("interview.review.reference.unavailable")}
        </AlertTitle>
      </Alert>
    )
  }

  return (
    <Accordion className="rounded-lg border border-primary/20 bg-primary/5 px-4">
      <AccordionItem value={`reference-${id}`}>
        <AccordionTrigger className="no-underline hover:no-underline">
          <span className="flex items-center gap-2 text-primary">
            <BookOpenTextIcon aria-hidden="true" />
            {t("interview.review.reference.view")}
          </span>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-5">
          <Alert>
            <LightbulbIcon aria-hidden="true" />
            <AlertDescription>{referenceAnswer.content.usageGuidance}</AlertDescription>
          </Alert>
          <div className="grid gap-5 md:grid-cols-2">
            <ReferenceList
              items={referenceAnswer.content.recommendedStructure}
              title={t("interview.review.reference.structure")}
            />
            <ReferenceList
              items={referenceAnswer.content.keyPoints}
              title={t("interview.review.reference.keyPoints")}
            />
          </div>
          <section className="flex max-w-prose flex-col gap-2">
            <h5 className="font-medium">{t("interview.review.reference.example")}</h5>
            <p className="whitespace-pre-wrap leading-7 text-muted-foreground">
              {referenceAnswer.content.exampleAnswer}
            </p>
          </section>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function ReferenceList({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h5 className="font-medium">{title}</h5>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
  )
}
