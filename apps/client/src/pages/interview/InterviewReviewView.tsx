import {
  ArrowLeftIcon,
  ChartNoAxesCombinedIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleOffIcon,
  ClipboardCheckIcon,
  DumbbellIcon,
  LightbulbIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  SparklesIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { InterviewReview, InterviewTrainingSuggestion } from "@/models/interview-workflow"

import { InterviewDimensionScores } from "./components/InterviewDimensionScores"
import { InterviewQuestionDetails } from "./components/InterviewQuestionDetails"
import { InterviewReviewListCard } from "./components/InterviewReviewListCard"

type PartialReviewData = Extract<InterviewReview, { status: "partial" }>
type CompleteReviewData = Extract<InterviewReview, { status: "complete" }>
type FailedReviewData = Extract<InterviewReview, { status: "failed" }>
type GeneratingReviewData = Extract<InterviewReview, { status: "generating" }>
type UnavailableReviewData = Extract<InterviewReview, { status: "unavailable" }>
type AvailableReviewData = PartialReviewData | CompleteReviewData

export type InterviewReviewViewProps =
  | { status: "loading" }
  | {
      status: "generating"
      data: GeneratingReviewData
    }
  | {
      status: "partial"
      data: PartialReviewData
      onBack: () => void
    }
  | {
      status: "complete"
      data: CompleteReviewData
      onBack: () => void
      onNextTraining: (suggestion: InterviewTrainingSuggestion) => void
    }
  | {
      status: "unavailable"
      data: UnavailableReviewData
      onBack: () => void
    }
  | {
      status: "failed"
      data: FailedReviewData
      onBack: () => void
    }
  | {
      status: "error"
      isRetrying: boolean
      onRetry: () => void
      onBack: () => void
    }

function ReviewLoadingCard({ title, rows = 3 }: { title: string; rows?: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton className="h-4 w-full last:w-3/4" key={index} />
        ))}
      </CardContent>
    </Card>
  )
}

export function InterviewReviewView(props: InterviewReviewViewProps) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Badge className="w-fit" variant="secondary">
          {t("interview.review.badge")}
        </Badge>
        <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
          {t("interview.review.title")}
        </h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          {t("interview.review.description")}
        </p>
      </header>

      {props.status === "loading" || props.status === "generating" ? (
        <ReviewLoading />
      ) : props.status === "partial" || props.status === "complete" ? (
        <ReviewContent
          data={props.data}
          onBack={props.onBack}
          onNextTraining={props.status === "complete" ? props.onNextTraining : undefined}
        />
      ) : props.status === "unavailable" ? (
        <ReviewUnavailable data={props.data} onBack={props.onBack} />
      ) : props.status === "failed" ? (
        <ReviewGenerationFailed data={props.data} onBack={props.onBack} />
      ) : (
        <ReviewError isRetrying={props.isRetrying} onBack={props.onBack} onRetry={props.onRetry} />
      )}
    </div>
  )
}

function ReviewGenerationFailed({ onBack }: { data: FailedReviewData; onBack: () => void }) {
  const { t } = useTranslation()

  return (
    <Card role="alert">
      <CardHeader>
        <CardTitle>{t("interview.review.failed.generationFailed.title")}</CardTitle>
        <CardDescription>
          {t("interview.review.failed.generationFailed.description")}
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button onClick={onBack} variant="outline">
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t("interview.review.actions.backToSetup")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function ReviewLoading() {
  const { t } = useTranslation()

  return (
    <div aria-busy="true" className="flex flex-col gap-6" data-testid="interview-review-loading">
      <Card>
        <CardHeader>
          <CardTitle>{t("interview.review.sections.overall")}</CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Spinner aria-hidden="true" />
            {t("interview.review.loadingTitle")}
          </CardDescription>
          <p className="text-sm text-muted-foreground">
            {t("interview.review.loadingDescription")}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Skeleton className="h-28 w-28 rounded-2xl" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </CardContent>
      </Card>
      <ReviewLoadingCard title={t("interview.review.sections.dimensions")} rows={4} />
      <ReviewLoadingCard title={t("interview.review.sections.questions")} rows={3} />
      <div className="grid gap-4 @3xl/app:grid-cols-2">
        <ReviewLoadingCard title={t("interview.review.sections.strengths")} />
        <ReviewLoadingCard title={t("interview.review.sections.frequentIssues")} />
        <ReviewLoadingCard title={t("interview.review.sections.weaknesses")} />
        <ReviewLoadingCard title={t("interview.review.sections.risks")} />
      </div>
    </div>
  )
}

function ReviewContent({
  data,
  onBack,
  onNextTraining,
}: {
  data: AvailableReviewData
  onBack: () => void
  onNextTraining?: (suggestion: InterviewTrainingSuggestion) => void
}) {
  const { t } = useTranslation()
  const isComplete = data.status === "complete"

  return (
    <div className="flex flex-col gap-6">
      {!isComplete ? (
        <Alert>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{t("interview.review.partialTitle")}</AlertTitle>
          <AlertDescription>{t("interview.review.partialDescription")}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("interview.review.sections.overall")}</CardTitle>
          {!isComplete ? (
            <CardDescription>{t("interview.review.partialOverallDescription")}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent
          className={cn(isComplete && "grid items-center gap-5 sm:grid-cols-[9rem_1fr]")}
        >
          {isComplete ? (
            <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <span className="font-heading text-5xl font-semibold">
                {data.review.overallScore}
              </span>
              <span className="text-sm">{t("interview.review.scoreUnit")}</span>
            </div>
          ) : null}
          <p className="leading-7 text-muted-foreground">{data.review.overallPerformance}</p>
        </CardContent>
      </Card>

      {isComplete ? <InterviewDimensionScores review={data.review} /> : null}
      <InterviewQuestionDetails details={data.questionDetails} />

      <div className="grid gap-4 @3xl/app:grid-cols-2">
        <InterviewReviewListCard
          icon={<CheckCircle2Icon aria-hidden="true" />}
          items={data.review.mainStrengths}
          title={t("interview.review.sections.strengths")}
        />
        <InterviewReviewListCard
          icon={<CircleAlertIcon aria-hidden="true" />}
          items={data.review.frequentIssues}
          title={t("interview.review.sections.frequentIssues")}
        />
        <InterviewReviewListCard
          icon={<ChartNoAxesCombinedIcon aria-hidden="true" />}
          items={data.review.exposedWeaknesses}
          title={t("interview.review.sections.weaknesses")}
        />
        <InterviewReviewListCard
          icon={<ShieldAlertIcon aria-hidden="true" />}
          items={data.review.riskPoints}
          title={t("interview.review.sections.risks")}
        />
        <InterviewReviewListCard
          icon={<LightbulbIcon aria-hidden="true" />}
          items={data.review.communicationSuggestions}
          title={t("interview.review.sections.communication")}
        />
        <InterviewReviewListCard
          icon={<ClipboardCheckIcon aria-hidden="true" />}
          items={data.review.preparationSuggestions}
          title={t("interview.review.sections.preparation")}
        />
      </div>

      {isComplete && onNextTraining ? (
        <NextTrainingCard
          nextTraining={data.review.nextTraining}
          onBack={onBack}
          onNextTraining={onNextTraining}
        />
      ) : (
        <Card>
          <CardFooter>
            <Button onClick={onBack} variant="outline">
              <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
              {t("interview.review.actions.backToSetup")}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}

function NextTrainingCard({
  nextTraining,
  onBack,
  onNextTraining,
}: {
  nextTraining: InterviewTrainingSuggestion
  onBack: () => void
  onNextTraining: (suggestion: InterviewTrainingSuggestion) => void
}) {
  const { t } = useTranslation()

  return (
    <Card className="bg-primary/5 ring-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon aria-hidden="true" />
          {t("interview.review.sections.nextTraining")}
        </CardTitle>
        <CardDescription>{nextTraining.reason}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {nextTraining.focusAreas.map((focusArea) => (
          <Badge key={focusArea} variant="secondary">
            {focusArea}
          </Badge>
        ))}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button onClick={() => onNextTraining(nextTraining)}>
          <DumbbellIcon aria-hidden="true" data-icon="inline-start" />
          {nextTraining.action === "targetedPractice"
            ? t("interview.review.actions.startTargetedPractice")
            : t("interview.review.actions.startMockInterview")}
        </Button>
        <Button onClick={onBack} variant="outline">
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t("interview.review.actions.backToSetup")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function ReviewUnavailable({ data, onBack }: { data: UnavailableReviewData; onBack: () => void }) {
  const { t } = useTranslation()

  if (data.questionDetails.length > 0) {
    return (
      <div className="flex flex-col gap-6">
        <Alert>
          <CircleOffIcon aria-hidden="true" />
          <AlertTitle>{t("interview.review.unavailable.insufficientAnswers.title")}</AlertTitle>
          <AlertDescription>
            {t("interview.review.unavailableWithLearningDescription")}
          </AlertDescription>
        </Alert>
        <InterviewQuestionDetails details={data.questionDetails} />
        <Card>
          <CardFooter>
            <Button onClick={onBack} variant="outline">
              <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
              {t("interview.review.actions.backToSetup")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleOffIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("interview.review.unavailable.insufficientAnswers.title")}</EmptyTitle>
            <EmptyDescription>
              {t("interview.review.unavailable.insufficientAnswers.description")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onBack}>
              <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
              {t("interview.review.actions.restart")}
            </Button>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  )
}

function ReviewError({
  isRetrying,
  onBack,
  onRetry,
}: {
  isRetrying: boolean
  onBack: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <Card role="alert">
      <CardHeader>
        <CardTitle>{t("interview.review.errorTitle")}</CardTitle>
        <CardDescription>{t("interview.review.errorDescription")}</CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-wrap gap-2">
        <Button disabled={isRetrying} onClick={onRetry}>
          {isRetrying ? (
            <Spinner aria-hidden="true" data-icon="inline-start" />
          ) : (
            <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
          )}
          {t("interview.review.actions.retry")}
        </Button>
        <Button onClick={onBack} variant="outline">
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t("interview.review.actions.backToSetup")}
        </Button>
      </CardFooter>
    </Card>
  )
}
