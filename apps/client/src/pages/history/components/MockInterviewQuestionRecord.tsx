import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  TrainingRecordEvaluation,
  TrainingRecordFollowUp,
  TrainingRecordQuestion,
  TrainingRecordReview,
} from "@/models/training-records"
import { InterviewAnswerAndPerformance } from "@/pages/interview/components/InterviewAnswerAndPerformance"
import { useTranslation } from "react-i18next"

import { HistoryReferenceAnswer } from "./HistoryReferenceAnswer"
import type { HistoryReferenceAnswerSubject } from "../hooks/useHistoryReferenceAnswerGeneration"

export function MockInterviewQuestionRecord({
  isReferenceAnswerRequesting,
  onGenerateReferenceAnswer,
  question,
}: {
  isReferenceAnswerRequesting: (subject: HistoryReferenceAnswerSubject) => boolean
  onGenerateReferenceAnswer: (subject: HistoryReferenceAnswerSubject) => void
  question: TrainingRecordQuestion
}) {
  const { t } = useTranslation()

  return (
    <Card data-testid={`mock-history-question-${question.id}`}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <Badge className="w-fit" variant="outline">
              {t("history.mockDetail.question", { order: question.order })}
            </Badge>
            <CardTitle className="text-lg leading-7">{question.prompt}</CardTitle>
          </div>
          <QuestionStatus evaluation={question.evaluation} answered={question.answer !== null} />
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-6">
        <InterviewAnswerAndPerformance
          answer={question.answer?.content ?? null}
          performance={toPerformance(question.id, question.evaluation, question.review)}
        />
        <HistoryReferenceAnswer
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
        />
        <section className="flex min-w-0 flex-col gap-3">
          <h3 className="font-heading text-base font-semibold">
            {t("history.mockDetail.followUps")}
          </h3>
          {question.followUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("history.mockDetail.noFollowUps")}</p>
          ) : (
            question.followUps.map((followUp) => (
              <FollowUpRecord
                followUp={followUp}
                key={followUp.id}
                isReferenceAnswerRequesting={isReferenceAnswerRequesting}
                onGenerateReferenceAnswer={onGenerateReferenceAnswer}
                questionId={question.id}
              />
            ))
          )}
        </section>
      </CardContent>
    </Card>
  )
}

function FollowUpRecord({
  followUp,
  isReferenceAnswerRequesting,
  onGenerateReferenceAnswer,
  questionId,
}: {
  followUp: TrainingRecordFollowUp
  isReferenceAnswerRequesting: (subject: HistoryReferenceAnswerSubject) => boolean
  onGenerateReferenceAnswer: (subject: HistoryReferenceAnswerSubject) => void
  questionId: string
}) {
  const { t } = useTranslation()
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <Badge className="w-fit" variant="outline">
              {t("history.mockDetail.followUp", { order: followUp.order })}
            </Badge>
            <CardTitle className="text-base leading-7">{followUp.prompt}</CardTitle>
          </div>
          <QuestionStatus answered={followUp.answer !== null} evaluation={followUp.evaluation} />
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        <InterviewAnswerAndPerformance
          answer={followUp.answer?.content ?? null}
          performance={toPerformance(followUp.id, followUp.evaluation, followUp.review)}
        />
        <HistoryReferenceAnswer
          isRequesting={isReferenceAnswerRequesting({
            subject: "followUp",
            questionId,
            followUpId: followUp.id,
          })}
          onGenerate={() =>
            onGenerateReferenceAnswer({
              subject: "followUp",
              questionId,
              followUpId: followUp.id,
            })
          }
          referenceAnswer={followUp.referenceAnswer}
        />
      </CardContent>
    </Card>
  )
}

function QuestionStatus({
  answered,
  evaluation,
}: {
  answered: boolean
  evaluation: TrainingRecordEvaluation | null
}) {
  const { t } = useTranslation()
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Badge variant={answered ? "secondary" : "outline"}>
        {t(answered ? "history.mockDetail.answered" : "history.mockDetail.unanswered")}
      </Badge>
      {evaluation && (
        <Badge>{t("history.mockDetail.scoreValue", { score: evaluation.overallScore })}</Badge>
      )}
    </div>
  )
}

function toPerformance(
  id: string,
  evaluation: TrainingRecordEvaluation | null,
  review: TrainingRecordReview | null,
) {
  if (!evaluation || !review) return null
  return {
    questionId: id,
    score: evaluation.overallScore,
    summary: review.summary,
    strengths: review.strengths,
    issues: review.issues,
  }
}
