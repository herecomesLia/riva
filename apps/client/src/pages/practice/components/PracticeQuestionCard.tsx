import { BookmarkIcon, BrainIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PracticeQuestion as PracticeQuestionCardModel } from "@/models/practice-workflow"

type PracticeQuestionCardProps = {
  question: PracticeQuestionCardModel
}

export function PracticeQuestionCard({ question }: PracticeQuestionCardProps) {
  const { t } = useTranslation()

  return (
    <Card className="min-w-0" data-testid="practice-question-card">
      <CardHeader>
        <CardTitle>
          <h3 className="wrap-break-word text-xl leading-8">{question.prompt}</h3>
        </CardTitle>
        {question.isSaved || question.isWeak ? (
          <CardAction
            className="row-span-1 flex flex-wrap items-center justify-end gap-2"
            data-testid="practice-question-statuses"
          >
            {question.isSaved ? (
              <Badge variant="secondary">
                <BookmarkIcon aria-hidden="true" />
                {t("practice.question.saved")}
              </Badge>
            ) : null}
            {question.isWeak ? (
              <Badge variant="secondary">
                <BrainIcon aria-hidden="true" />
                {t("practice.question.weak")}
              </Badge>
            ) : null}
          </CardAction>
        ) : null}
      </CardHeader>
      {question.criteria.length > 0 ? (
        <CardContent>
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t("practice.question.focus")}
            </h4>
            <ul className="flex flex-wrap gap-2">
              {question.criteria.map(({ dimension }) => (
                <li key={dimension}>
                  <Badge className="max-w-full whitespace-normal wrap-break-word" variant="outline">
                    {dimension}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        </CardContent>
      ) : null}
    </Card>
  )
}
