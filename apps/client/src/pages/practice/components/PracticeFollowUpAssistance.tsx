import { useTranslation } from "react-i18next"
import type { PracticeFollowUp } from "@/models/practice-workflow"
import { PracticeQuestionGuidance } from "./PracticeQuestionGuidance"
import { PracticeReferenceAnswer } from "./PracticeReferenceAnswer"

export function PracticeFollowUpAssistance({ question }: { question: PracticeFollowUp }) {
  const { t } = useTranslation()
  return (
    <section
      aria-label={t("practice.followUpAssistance.title")}
      className="flex min-w-0 flex-col gap-4"
      data-testid="practice-follow-up-assistance"
    >
      <PracticeQuestionGuidance {...question.guidance} />
      <PracticeReferenceAnswer referenceAnswer={question.referenceAnswer} />
    </section>
  )
}
