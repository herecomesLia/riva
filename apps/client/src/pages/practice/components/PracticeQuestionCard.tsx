import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
