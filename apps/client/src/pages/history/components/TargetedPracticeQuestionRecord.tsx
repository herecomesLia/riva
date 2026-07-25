import { BookmarkIcon, ChevronDownIcon, FlagIcon, RotateCcwIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type {
  TrainingRecordAnswer,
  TrainingRecordEvaluation,
  TrainingRecordQuestion,
  TrainingRecordReview,
} from "@/models/training-records"
import { PracticeDimensionScores } from "@/pages/practice/components/PracticeDimensionScores"
import { cn } from "@/lib/utils"
import {
  PracticeAnswerHighlights,
  PracticeAnswerIssues,
  PracticeImprovementPlan,
  PracticeReusableStructure,
} from "@/pages/practice/components/PracticeReviewDetails"

import { HistoryReferenceAnswer } from "./HistoryReferenceAnswer"
import type { HistoryReferenceAnswerSubject } from "../hooks/useHistoryReferenceAnswerGeneration"

export function TargetedPracticeQuestionRecord({
  isReferenceAnswerRequesting,
  onGenerateReferenceAnswer,
  question,
}: {
  isReferenceAnswerRequesting: (subject: HistoryReferenceAnswerSubject) => boolean
  onGenerateReferenceAnswer: (subject: HistoryReferenceAnswerSubject) => void
  question: TrainingRecordQuestion
}) {
  const { i18n, t } = useTranslation()

  return (
    <Card data-testid={`history-question-${question.id}`}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{t("history.detail.question", { order: question.order })}</Badge>
              <Badge variant="outline">
                {t("history.detail.attempt", { count: question.attemptNumber })}
              </Badge>
              {question.retryOfQuestionId && (
                <Badge variant="secondary">
                  <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
                  {t("history.detail.retryAttempt")}
                </Badge>
              )}
              <Badge variant="outline">
                <BookmarkIcon
                  aria-hidden="true"
                  className={cn(question.isSaved && "fill-destructive text-destructive")}
                  data-icon="inline-start"
                />
                {t(question.isSaved ? "history.detail.saved" : "history.detail.unsaved")}
              </Badge>
              <Badge variant="outline">
                <FlagIcon
                  aria-hidden="true"
                  className={cn(question.isMarkedWeak && "fill-orange-500 text-orange-500")}
                  data-icon="inline-start"
                />
                {t(question.isMarkedWeak ? "history.detail.weak" : "history.detail.notWeak")}
              </Badge>
            </div>
            <CardTitle className="text-lg leading-7">{question.prompt}</CardTitle>
            <CardDescription>
              {t("history.detail.capabilities")}：
              {new Intl.ListFormat(i18n.language).format(question.assessedCapabilities)}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-6">
        <AnswerSection answer={question.answer} />
        <QuestionDetails
          evaluation={question.evaluation}
          isRequesting={isReferenceAnswerRequesting({
            subject: "mainQuestion",
            questionId: question.id,
          })}
          onGenerate={() =>
            onGenerateReferenceAnswer({
              subject: "mainQuestion",
              questionId: question.id,
            })
          }
          referenceAnswer={question.referenceAnswer}
          review={question.review}
        />

        <section aria-labelledby={`${question.id}-follow-ups`} className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-semibold" id={`${question.id}-follow-ups`}>
            {t("history.detail.followUps")}
          </h3>
          {question.followUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("history.detail.noFollowUps")}</p>
          ) : (
            question.followUps.map((followUp) => (
              <Card key={followUp.id} size="sm">
                <CardHeader>
                  <Badge className="w-fit" variant="outline">
                    {t("history.detail.followUp", { order: followUp.order })}
                  </Badge>
                  <CardTitle className="text-base leading-7">{followUp.prompt}</CardTitle>
                </CardHeader>
                <CardContent className="flex min-w-0 flex-col gap-5">
                  <AnswerSection answer={followUp.answer} />
                  <QuestionDetails
                    evaluation={followUp.evaluation}
                    isRequesting={isReferenceAnswerRequesting({
                      subject: "followUp",
                      questionId: question.id,
                      followUpId: followUp.id,
                    })}
                    onGenerate={() =>
                      onGenerateReferenceAnswer({
                        subject: "followUp",
                        questionId: question.id,
                        followUpId: followUp.id,
                      })
                    }
                    referenceAnswer={followUp.referenceAnswer}
                    review={followUp.review}
                  />
                </CardContent>
              </Card>
            ))
          )}
        </section>
      </CardContent>
    </Card>
  )
}

function QuestionDetails({
  evaluation,
  isRequesting,
  onGenerate,
  referenceAnswer,
  review,
}: {
  evaluation: TrainingRecordEvaluation | null
  isRequesting: boolean
  onGenerate: () => void
  referenceAnswer: TrainingRecordQuestion["referenceAnswer"]
  review: TrainingRecordReview | null
}) {
  const { t } = useTranslation()

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {(evaluation || review) && (
        <DetailCollapsible label={t("history.detail.evaluationDetails")}>
          <EvaluationSection evaluation={evaluation} review={review} />
        </DetailCollapsible>
      )}
      <DetailCollapsible label={t("history.detail.reference.title")}>
        <HistoryReferenceAnswer
          isRequesting={isRequesting}
          onGenerate={onGenerate}
          referenceAnswer={referenceAnswer}
        />
      </DetailCollapsible>
    </div>
  )
}

function DetailCollapsible({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Collapsible className="flex min-w-0 flex-col gap-3">
      <CollapsibleTrigger
        render={<Button className="w-full justify-between" variant="outline-static" />}
      >
        {label}
        <ChevronDownIcon
          aria-hidden="true"
          className="transition-transform group-aria-expanded/button:rotate-180"
          data-icon="inline-end"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

function AnswerSection({ answer }: { answer: TrainingRecordAnswer | null }) {
  const { t } = useTranslation()

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="font-heading text-base font-semibold">{t("history.detail.answer")}</h3>
      {answer ? (
        <p className="max-w-prose whitespace-pre-wrap rounded-xl bg-muted/60 p-4 text-sm leading-7">
          {answer.content}
        </p>
      ) : (
        <div className="rounded-xl border border-dashed p-4">
          <p className="font-medium">{t("history.detail.unanswered")}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t("history.detail.unansweredDescription")}
          </p>
        </div>
      )}
    </section>
  )
}

function EvaluationSection({
  evaluation,
  review,
}: {
  evaluation: TrainingRecordEvaluation | null
  review: TrainingRecordReview | null
}) {
  const { t } = useTranslation()
  if (!evaluation && !review) return null

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <h3 className="font-heading text-base font-semibold">{t("history.detail.evaluation")}</h3>
      {evaluation && (
        <>
          <div className="flex items-baseline gap-1">
            <span className="font-heading text-4xl font-semibold tabular-nums">
              {evaluation.overallScore}
            </span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
          <PracticeDimensionScores scores={evaluation.dimensions} />
        </>
      )}
      {review && (
        <>
          <p className="text-sm leading-7">{review.summary}</p>
          <div className="grid gap-4 lg:grid-cols-3">
            <PracticeAnswerHighlights items={review.strengths} />
            <PracticeAnswerIssues items={review.issues} />
            <PracticeImprovementPlan items={review.improvementSuggestions} />
          </div>
          <PracticeReusableStructure items={review.reusableAnswerStructure} />
        </>
      )}
    </section>
  )
}
