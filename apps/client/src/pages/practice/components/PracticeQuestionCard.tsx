import { BookmarkIcon, BrainIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PracticeQuestionCard as PracticeQuestionCardModel } from "@/models/practice"

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
        {question.isSaved || question.isMarkedWeak ? (
          <CardAction
            className="flex flex-wrap items-center justify-end gap-2"
            data-testid="practice-question-statuses"
          >
            {question.isSaved ? (
              <Badge variant="secondary">
                <BookmarkIcon aria-hidden="true" />
                {t("practice.question.saved")}
              </Badge>
            ) : null}
            {question.isMarkedWeak ? (
              <Badge variant="secondary">
                <BrainIcon aria-hidden="true" />
                {t("practice.question.weak")}
              </Badge>
            ) : null}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <QuestionMetadata
          items={question.assessedCapabilities.map((label) => ({ key: label, label }))}
          title={t("practice.question.capabilities")}
        />
        {question.recommendedMaterials.length > 0 ? (
          <QuestionMetadata
            items={question.recommendedMaterials.map((material) => ({
              key: `${material.type}:${material.id}`,
              label: material.label,
            }))}
            title={t("practice.question.recommendedMaterials")}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

function QuestionMetadata({
  items,
  title,
}: {
  items: { key: string; label: string }[]
  title: string
}) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.key}>
            <Badge className="max-w-full whitespace-normal wrap-break-word" variant="outline">
              {item.label}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}
