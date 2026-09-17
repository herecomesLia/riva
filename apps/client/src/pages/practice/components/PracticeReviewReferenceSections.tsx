import { useTranslation } from "react-i18next"
import { Separator } from "@/components/ui/separator"
import type { PracticeFollowUp } from "@/models/practice-workflow"

export function PracticeReviewReferenceSections({ question }: { question: PracticeFollowUp }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 flex-col break-words [overflow-wrap:anywhere]">
      <section className="flex min-w-0 flex-col gap-2 pb-5">
        <h4 className="font-heading text-sm font-medium">
          {t("practice.questionReview.referenceAnswer")}
        </h4>
        <p className="text-xs leading-5 text-muted-foreground">
          {t("practice.questionReview.aiGeneratedDisclaimer")}
        </p>
        <p className="whitespace-pre-wrap text-sm leading-7">{question.referenceAnswer}</p>
      </section>
      <Separator />
      <div className="py-5">
        <ReviewGuidance
          items={question.guidance.hints}
          title={t("practice.guidance.hintTitle")}
          emptyLabel={t("practice.guidance.hintEmpty")}
        />
      </div>
      <Separator />
      <div className="pt-5">
        <ReviewGuidance
          items={question.guidance.framework}
          title={t("practice.guidance.frameworkTitle")}
          emptyLabel={t("practice.guidance.frameworkEmpty")}
          ordered
        />
      </div>
    </div>
  )
}

function ReviewGuidance({
  items,
  title,
  emptyLabel,
  ordered = false,
}: {
  items: string[]
  title: string
  emptyLabel: string
  ordered?: boolean
}) {
  const List = ordered ? "ol" : "ul"
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h4 className="font-heading text-sm font-medium">{title}</h4>
      {items.length > 0 ? (
        <List className={`${ordered ? "list-decimal" : "list-disc"} pl-5 text-sm leading-6`}>
          {items.map((item) => (
            <li className="break-words [overflow-wrap:anywhere]" key={item}>
              {item}
            </li>
          ))}
        </List>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </section>
  )
}
