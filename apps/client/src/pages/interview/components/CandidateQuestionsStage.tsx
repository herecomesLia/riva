import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CompassIcon,
  LightbulbIcon,
  ShieldAlertIcon,
  SparklesIcon,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import type { InterviewCandidateQuestionExchangeResponse } from "@/models/interview"

import { CandidateQuestionComposer } from "./CandidateQuestionComposer"

type CandidateQuestionsStageProps = {
  exchanges: readonly InterviewCandidateQuestionExchangeResponse[]
  isFinishing: boolean
  isInteractionLocked: boolean
  isSubmittingQuestion: boolean
  onFinish: () => Promise<void>
  onSubmitQuestion: (content: string) => Promise<void>
  prompt: string
}

export function CandidateQuestionsStage({
  exchanges,
  isFinishing,
  isInteractionLocked,
  isSubmittingQuestion,
  onFinish,
  onSubmitQuestion,
  prompt,
}: CandidateQuestionsStageProps) {
  const { t } = useTranslation()
  const [finishOpen, setFinishOpen] = useState(false)
  const [finishFailed, setFinishFailed] = useState(false)

  async function finish() {
    setFinishFailed(false)
    try {
      await onFinish()
      setFinishOpen(false)
    } catch {
      setFinishFailed(true)
    }
  }

  return (
    <main className="flex min-w-0 flex-col gap-6">
      <Card>
        <CardHeader>
          <Badge className="mb-2" variant="secondary">
            {t("interview.session.candidate.badge")}
          </Badge>
          <CardTitle>{t("interview.session.candidate.title")}</CardTitle>
          <CardDescription>{prompt}</CardDescription>
        </CardHeader>
      </Card>

      {exchanges.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("interview.session.candidate.exchangesTitle")}</CardTitle>
            <CardDescription>
              {t("interview.session.candidate.exchangesDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Alert>
              <ShieldAlertIcon aria-hidden="true" />
              <AlertTitle>{t("interview.session.candidate.disclaimerTitle")}</AlertTitle>
              <AlertDescription>{t("interview.session.candidate.disclaimer")}</AlertDescription>
            </Alert>
            <ol className="flex flex-col gap-6">
              {exchanges.map((exchange, index) => (
                <li className="flex min-w-0 flex-col gap-4" key={exchange.question.id}>
                  {index > 0 ? <Separator /> : null}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("interview.session.candidate.yourQuestion", {
                        current: index + 1,
                      })}
                    </p>
                    <p className="break-words font-medium leading-7">{exchange.question.content}</p>
                  </div>
                  <CandidateQuestionAnalysis exchange={exchange} />
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <CandidateQuestionComposer isPending={isSubmittingQuestion} onSubmit={onSubmitQuestion} />

      <div className="flex justify-end">
        <Button disabled={isInteractionLocked} onClick={() => setFinishOpen(true)} type="button">
          {isFinishing ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
          {t("interview.session.candidate.finish")}
        </Button>
      </div>

      <AlertDialog onOpenChange={setFinishOpen} open={finishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("interview.session.candidate.finishDialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("interview.session.candidate.finishDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {finishFailed ? (
            <Alert variant="destructive">
              <AlertTitle>{t("interview.session.errors.finishTitle")}</AlertTitle>
              <AlertDescription>{t("interview.session.errors.finishDescription")}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isInteractionLocked}>
              {t("interview.session.actions.continue")}
            </AlertDialogCancel>
            <AlertDialogAction disabled={isInteractionLocked} onClick={() => void finish()}>
              {isFinishing ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
              {t("interview.session.candidate.confirmFinish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function CandidateQuestionAnalysis({
  exchange,
}: {
  exchange: InterviewCandidateQuestionExchangeResponse
}) {
  const { t } = useTranslation()
  const { feedback } = exchange
  const hasAnalysis =
    feedback.summary.trim().length > 0 ||
    feedback.strengths.length > 0 ||
    feedback.improvementSuggestions.length > 0 ||
    feedback.suggestedAlternatives.length > 0 ||
    exchange.interviewerAnswer.trim().length > 0

  if (!hasAnalysis) {
    return (
      <Alert>
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>{t("interview.session.candidate.noAnalysisTitle")}</AlertTitle>
        <AlertDescription>
          {t("interview.session.candidate.noAnalysisDescription")}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {feedback.summary.trim().length > 0 ? (
        <Alert className="md:col-span-2">
          <SparklesIcon aria-hidden="true" />
          <AlertTitle>{t("interview.session.candidate.analysis")}</AlertTitle>
          <AlertDescription>{feedback.summary}</AlertDescription>
        </Alert>
      ) : null}
      {feedback.strengths.length > 0 ? (
        <Alert>
          <CheckCircle2Icon aria-hidden="true" />
          <AlertTitle>{t("interview.session.candidate.strengths")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {feedback.strengths.map((strength) => (
                <li key={strength}>{strength}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {feedback.improvementSuggestions.length > 0 ? (
        <Alert>
          <LightbulbIcon aria-hidden="true" />
          <AlertTitle>{t("interview.session.candidate.improvementSuggestions")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {feedback.improvementSuggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {exchange.interviewerAnswer.trim().length > 0 ? (
        <Alert>
          <CompassIcon aria-hidden="true" />
          <AlertTitle>{t("interview.session.candidate.recommendedFocus")}</AlertTitle>
          <AlertDescription>
            <p>{t("interview.session.candidate.recommendedFocusLead")}</p>
            <p>{exchange.interviewerAnswer}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      {feedback.suggestedAlternatives.length > 0 ? (
        <Alert>
          <LightbulbIcon aria-hidden="true" />
          <AlertTitle>{t("interview.session.candidate.betterQuestion")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {feedback.suggestedAlternatives.map((alternative) => (
                <li key={alternative}>{alternative}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
