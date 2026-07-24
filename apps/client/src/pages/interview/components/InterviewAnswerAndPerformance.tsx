import { useTranslation } from "react-i18next"

import type {
  InterviewFollowUpLearningDetailResponse,
  InterviewQuestionReviewResponse,
} from "@/models/interview"

export function InterviewAnswerAndPerformance({
  answer,
  performance,
}: {
  answer: string | null
  performance:
    InterviewQuestionReviewResponse | InterviewFollowUpLearningDetailResponse["performance"]
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-lg bg-muted/50 p-4">
        <h4 className="font-medium">{t("interview.review.myAnswer")}</h4>
        <p className="whitespace-pre-wrap leading-6 text-muted-foreground">
          {answer ?? t("interview.review.unanswered")}
        </p>
      </section>
      {performance ? (
        <section className="flex flex-col gap-3">
          <h4 className="font-medium">{t("interview.review.performance")}</h4>
          <p className="leading-6 text-muted-foreground">{performance.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <QuestionReviewList
              items={performance.strengths}
              title={t("interview.review.questionStrengths")}
            />
            <QuestionReviewList
              items={performance.issues}
              title={t("interview.review.questionIssues")}
            />
          </div>
        </section>
      ) : null}
    </div>
  )
}

function QuestionReviewList({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-medium">{title}</h4>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
