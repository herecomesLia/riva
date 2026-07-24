import type { ReactNode } from "react"
import {
  ArrowLeftIcon,
  BookOpenTextIcon,
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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
import type {
  GetInterviewReviewResponse,
  InterviewFollowUpLearningDetailResponse,
  InterviewQuestionLearningDetailResponse,
  InterviewQuestionReviewResponse,
  InterviewReferenceAnswerResponse,
  InterviewReviewResponse,
  InterviewScoreDimension,
  InterviewTrainingSuggestionResponse,
} from "@/models/interview"

type PartialReviewData = Extract<GetInterviewReviewResponse, { status: "partial" }>
type CompleteReviewData = Extract<GetInterviewReviewResponse, { status: "complete" }>
type UnavailableReviewData = Extract<GetInterviewReviewResponse, { status: "unavailable" }>
type AvailableReviewData = PartialReviewData | CompleteReviewData

export type InterviewReviewViewProps =
  | { status: "loading" }
  | {
      status: "partial"
      data: PartialReviewData
      onBack: () => void
    }
  | {
      status: "complete"
      data: CompleteReviewData
      onBack: () => void
      onNextTraining: (suggestion: InterviewTrainingSuggestionResponse) => void
    }
  | {
      status: "unavailable"
      data: UnavailableReviewData
      onBack: () => void
    }
  | {
      status: "error"
      isRetrying: boolean
      onRetry: () => void
      onBack: () => void
    }

function ReviewListCard({
  icon,
  items,
  title,
}: {
  icon: ReactNode
  items: string[]
  title: string
}) {
  if (items.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          {items.map((item) => (
            <li className="flex gap-2" key={item}>
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-0">
      <header className="flex flex-col gap-2">
        <Badge className="w-fit" variant="secondary">
          {t("interview.review.badge")}
        </Badge>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("interview.review.title")}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("interview.review.description")}
        </p>
      </header>

      {props.status === "loading" ? (
        <ReviewLoading />
      ) : props.status === "partial" || props.status === "complete" ? (
        <ReviewContent
          data={props.data}
          onBack={props.onBack}
          onNextTraining={props.status === "complete" ? props.onNextTraining : undefined}
        />
      ) : props.status === "unavailable" ? (
        <ReviewUnavailable data={props.data} onBack={props.onBack} />
      ) : (
        <ReviewError isRetrying={props.isRetrying} onBack={props.onBack} onRetry={props.onRetry} />
      )}
    </div>
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
      <div className="grid gap-4 md:grid-cols-2">
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
  onNextTraining?: (suggestion: InterviewTrainingSuggestionResponse) => void
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

      {isComplete ? <DimensionScores review={data.review} /> : null}
      <QuestionDetails details={data.questionDetails} />

      <div className="grid gap-4 md:grid-cols-2">
        <ReviewListCard
          icon={<CheckCircle2Icon aria-hidden="true" />}
          items={data.review.mainStrengths}
          title={t("interview.review.sections.strengths")}
        />
        <ReviewListCard
          icon={<CircleAlertIcon aria-hidden="true" />}
          items={data.review.frequentIssues}
          title={t("interview.review.sections.frequentIssues")}
        />
        <ReviewListCard
          icon={<ChartNoAxesCombinedIcon aria-hidden="true" />}
          items={data.review.exposedWeaknesses}
          title={t("interview.review.sections.weaknesses")}
        />
        <ReviewListCard
          icon={<ShieldAlertIcon aria-hidden="true" />}
          items={data.review.riskPoints}
          title={t("interview.review.sections.risks")}
        />
        <ReviewListCard
          icon={<LightbulbIcon aria-hidden="true" />}
          items={data.review.communicationSuggestions}
          title={t("interview.review.sections.communication")}
        />
        <ReviewListCard
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

function DimensionScores({ review }: { review: InterviewReviewResponse }) {
  const { t } = useTranslation()
  const dimensionLabels: Record<InterviewScoreDimension, string> = {
    relevance: t("interview.review.dimensions.relevance"),
    structure: t("interview.review.dimensions.structure"),
    specificity: t("interview.review.dimensions.specificity"),
    personalContribution: t("interview.review.dimensions.personalContribution"),
    resultsAndEvidence: t("interview.review.dimensions.resultsAndEvidence"),
    roleAlignment: t("interview.review.dimensions.roleAlignment"),
    communication: t("interview.review.dimensions.communication"),
    riskControl: t("interview.review.dimensions.riskControl"),
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("interview.review.sections.dimensions")}</CardTitle>
        <CardDescription>{t("interview.review.dimensionDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {review.dimensionScores.map((dimension) => (
          <div
            className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4"
            key={dimension.dimension}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">{dimensionLabels[dimension.dimension]}</h3>
              <Badge variant="outline">
                {t("interview.review.score", { score: dimension.score })}
              </Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{dimension.explanation}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function QuestionDetails({ details }: { details: InterviewQuestionLearningDetailResponse[] }) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("interview.review.sections.questions")}</CardTitle>
        <CardDescription>{t("interview.review.questionDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion>
          {details.map((detail) => (
            <AccordionItem key={detail.record.question.id} value={detail.record.question.id}>
              <AccordionTrigger className="gap-3 no-underline hover:no-underline">
                <span className="flex min-w-0 flex-1 flex-col gap-1 pr-3">
                  <span className="text-xs font-normal text-muted-foreground">
                    {t("interview.review.mainQuestion", { order: detail.record.question.order })}
                  </span>
                  <span className="line-clamp-2 text-sm">{detail.record.question.prompt}</span>
                </span>
                {detail.performance ? (
                  <Badge className="shrink-0" variant="secondary">
                    {t("interview.review.score", { score: detail.performance.score })}
                  </Badge>
                ) : (
                  <Badge className="shrink-0" variant="outline">
                    {t("interview.review.unanswered")}
                  </Badge>
                )}
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-5">
                <AnswerAndPerformance
                  answer={detail.record.answer?.content ?? null}
                  performance={detail.performance}
                />
                <ReferenceAnswer
                  id={detail.record.question.id}
                  referenceAnswer={detail.referenceAnswer}
                />
                {detail.followUps.length > 0 ? (
                  <FollowUpDetails followUps={detail.followUps} />
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}

function AnswerAndPerformance({
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

function FollowUpDetails({ followUps }: { followUps: InterviewFollowUpLearningDetailResponse[] }) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-medium">{t("interview.review.followUpQuestions")}</h4>
      <Accordion className="rounded-lg border px-4">
        {followUps.map((followUp) => (
          <AccordionItem key={followUp.record.question.id} value={followUp.record.question.id}>
            <AccordionTrigger className="gap-3 no-underline hover:no-underline">
              <span className="min-w-0 flex-1 text-left">{followUp.record.question.prompt}</span>
              <Badge variant={followUp.record.status === "answered" ? "secondary" : "outline"}>
                {followUp.record.status === "answered"
                  ? t("interview.review.answered")
                  : t("interview.review.unanswered")}
              </Badge>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4">
              <AnswerAndPerformance
                answer={followUp.record.answer?.content ?? null}
                performance={followUp.performance}
              />
              <ReferenceAnswer
                id={followUp.record.question.id}
                referenceAnswer={followUp.referenceAnswer}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}

function ReferenceAnswer({
  id,
  referenceAnswer,
}: {
  id: string
  referenceAnswer: InterviewReferenceAnswerResponse
}) {
  const { t } = useTranslation()
  if (referenceAnswer.status !== "ready") {
    return (
      <Alert>
        <BookOpenTextIcon aria-hidden="true" />
        <AlertTitle>
          {referenceAnswer.status === "generating"
            ? t("interview.review.reference.generating")
            : t("interview.review.reference.unavailable")}
        </AlertTitle>
      </Alert>
    )
  }

  return (
    <Accordion className="rounded-lg border border-primary/20 bg-primary/5 px-4">
      <AccordionItem value={`reference-${id}`}>
        <AccordionTrigger className="no-underline hover:no-underline">
          <span className="flex items-center gap-2 text-primary">
            <BookOpenTextIcon aria-hidden="true" />
            {t("interview.review.reference.view")}
          </span>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-5">
          <Alert>
            <LightbulbIcon aria-hidden="true" />
            <AlertDescription>{referenceAnswer.content.usageGuidance}</AlertDescription>
          </Alert>
          <div className="grid gap-5 md:grid-cols-2">
            <ReferenceList
              items={referenceAnswer.content.recommendedStructure}
              title={t("interview.review.reference.structure")}
            />
            <ReferenceList
              items={referenceAnswer.content.keyPoints}
              title={t("interview.review.reference.keyPoints")}
            />
          </div>
          <section className="flex max-w-prose flex-col gap-2">
            <h5 className="font-medium">{t("interview.review.reference.example")}</h5>
            <p className="whitespace-pre-wrap leading-7 text-muted-foreground">
              {referenceAnswer.content.exampleAnswer}
            </p>
          </section>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function ReferenceList({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h5 className="font-medium">{title}</h5>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
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

function NextTrainingCard({
  nextTraining,
  onBack,
  onNextTraining,
}: {
  nextTraining: InterviewTrainingSuggestionResponse
  onBack: () => void
  onNextTraining: (suggestion: InterviewTrainingSuggestionResponse) => void
}) {
  const { t } = useTranslation()

  return (
    <Card className="border-primary/20 bg-primary/5">
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
          <AlertTitle>{t(`interview.review.unavailable.${data.reason}.title`)}</AlertTitle>
          <AlertDescription>
            {t("interview.review.unavailableWithLearningDescription")}
          </AlertDescription>
        </Alert>
        <QuestionDetails details={data.questionDetails} />
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
            <EmptyTitle>{t(`interview.review.unavailable.${data.reason}.title`)}</EmptyTitle>
            <EmptyDescription>
              {t(`interview.review.unavailable.${data.reason}.description`)}
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
