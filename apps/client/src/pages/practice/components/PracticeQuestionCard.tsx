import { BookmarkIcon, BrainIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PracticeQuestionCard as PracticeQuestionCardModel } from "@/models/practice"

type PracticeQuestionCardProps = {
  question: PracticeQuestionCardModel
}

export function PracticeQuestionCard({ question }: PracticeQuestionCardProps) {
  const { t } = useTranslation()

  return (
    <Card data-testid="practice-question-card">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{t(`practice.questionTypes.${question.questionType}`)}</Badge>
          <Badge variant="outline">{t(`practice.difficulty.${question.difficulty}`)}</Badge>
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
        </div>
        <CardTitle>
          <h3 className="text-xl leading-8">{question.prompt}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <QuestionMetadata
          items={question.assessedCapabilities}
          title={t("practice.question.capabilities")}
        />
        {question.recommendedMaterials.length > 0 ? (
          <QuestionMetadata
            items={question.recommendedMaterials}
            title={t("practice.question.recommendedMaterials")}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

function QuestionMetadata({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item}>
            <Badge variant="outline">{item}</Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}
