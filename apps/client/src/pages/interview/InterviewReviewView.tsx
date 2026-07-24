import type { ReactNode } from "react"
import {
  ArrowLeftIcon,
  ChartNoAxesCombinedIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleOffIcon,
  ClipboardCheckIcon,
  DumbbellIcon,
  LightbulbIcon,
  MessageSquareTextIcon,
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
import type {
  GetInterviewReviewResponse,
  InterviewScoreDimension,
  InterviewTrainingSuggestionResponse,
} from "@/models/interview"

export type InterviewReviewViewProps =
  | { status: "loading" }
  | {
      status: "ready"
      data: GetInterviewReviewResponse
      onBack: () => void
      onNextTraining: (suggestion: InterviewTrainingSuggestionResponse) => void
    }
  | { status: "empty"; onBack: () => void }
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
        <div
          aria-busy="true"
          className="flex flex-col gap-6"
          data-testid="interview-review-loading"
        >
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
            <ReviewLoadingCard title={t("interview.review.sections.communication")} />
            <ReviewLoadingCard title={t("interview.review.sections.preparation")} />
          </div>
          <ReviewLoadingCard title={t("interview.review.sections.nextTraining")} />
        </div>
      ) : props.status === "ready" ? (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("interview.review.sections.overall")}</CardTitle>
            </CardHeader>
            <CardContent className="grid items-center gap-5 sm:grid-cols-[9rem_1fr]">
              <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <span className="font-heading text-5xl font-semibold">
                  {props.data.review.overallScore}
                </span>
                <span className="text-sm">{t("interview.review.scoreUnit")}</span>
              </div>
              <p className="leading-7 text-muted-foreground">
                {props.data.review.overallPerformance}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("interview.review.sections.dimensions")}</CardTitle>
              <CardDescription>{t("interview.review.dimensionDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {props.data.review.dimensionScores.map((dimension) => (
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

          <Card>
            <CardHeader>
              <CardTitle>{t("interview.review.sections.questions")}</CardTitle>
              <CardDescription>{t("interview.review.questionDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion>
                {props.data.questionOverviews.map((overview) => (
                  <AccordionItem key={overview.question.id} value={overview.question.id}>
                    <AccordionTrigger className="gap-3 no-underline hover:no-underline">
                      <span className="flex min-w-0 flex-1 flex-col gap-1 pr-3">
                        <span className="text-xs font-normal text-muted-foreground">
                          {t("interview.review.mainQuestion", {
                            order: overview.question.order,
                          })}
                        </span>
                        <span className="line-clamp-2 text-sm">{overview.question.prompt}</span>
                      </span>
                      <Badge className="shrink-0" variant="secondary">
                        {t("interview.review.score", {
                          score: overview.performance.score,
                        })}
                      </Badge>
                    </AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-4">
                      <p className="leading-6 text-muted-foreground">
                        {overview.performance.summary}
                      </p>
                      {overview.followUps.length > 0 ? (
                        <section className="rounded-lg bg-muted/50 p-4">
                          <h4 className="mb-2 font-medium">
                            {t("interview.review.followUpQuestions")}
                          </h4>
                          <ul className="flex flex-col gap-2 text-muted-foreground">
                            {overview.followUps.map((followUp) => (
                              <li className="flex gap-2" key={followUp.id}>
                                <MessageSquareTextIcon
                                  aria-hidden="true"
                                  className="mt-0.5 size-4 shrink-0"
                                />
                                <span>{followUp.prompt}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ) : null}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <section>
                          <h4 className="mb-2 font-medium">
                            {t("interview.review.questionStrengths")}
                          </h4>
                          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                            {overview.performance.strengths.map((strength) => (
                              <li key={strength}>{strength}</li>
                            ))}
                          </ul>
                        </section>
                        <section>
                          <h4 className="mb-2 font-medium">
                            {t("interview.review.questionIssues")}
                          </h4>
                          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                            {overview.performance.issues.map((issue) => (
                              <li key={issue}>{issue}</li>
                            ))}
                          </ul>
                        </section>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <ReviewListCard
              icon={<CheckCircle2Icon aria-hidden="true" className="size-5" />}
              items={props.data.review.mainStrengths}
              title={t("interview.review.sections.strengths")}
            />
            <ReviewListCard
              icon={<CircleAlertIcon aria-hidden="true" className="size-5" />}
              items={props.data.review.frequentIssues}
              title={t("interview.review.sections.frequentIssues")}
            />
            <ReviewListCard
              icon={<ChartNoAxesCombinedIcon aria-hidden="true" className="size-5" />}
              items={props.data.review.exposedWeaknesses}
              title={t("interview.review.sections.weaknesses")}
            />
            <ReviewListCard
              icon={<ShieldAlertIcon aria-hidden="true" className="size-5" />}
              items={props.data.review.riskPoints}
              title={t("interview.review.sections.risks")}
            />
            <ReviewListCard
              icon={<LightbulbIcon aria-hidden="true" className="size-5" />}
              items={props.data.review.communicationSuggestions}
              title={t("interview.review.sections.communication")}
            />
            <ReviewListCard
              icon={<ClipboardCheckIcon aria-hidden="true" className="size-5" />}
              items={props.data.review.preparationSuggestions}
              title={t("interview.review.sections.preparation")}
            />
          </div>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SparklesIcon aria-hidden="true" className="size-5 text-primary" />
                {t("interview.review.sections.nextTraining")}
              </CardTitle>
              <CardDescription>{props.data.review.nextTraining.reason}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {props.data.review.nextTraining.focusAreas.map((focusArea) => (
                <Badge key={focusArea} variant="secondary">
                  {focusArea}
                </Badge>
              ))}
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button onClick={() => props.onNextTraining(props.data.review.nextTraining)}>
                <DumbbellIcon aria-hidden="true" data-icon="inline-start" />
                {props.data.review.nextTraining.action === "targetedPractice"
                  ? t("interview.review.actions.startTargetedPractice")
                  : t("interview.review.actions.startMockInterview")}
              </Button>
              <Button onClick={props.onBack} variant="outline">
                <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
                {t("interview.review.actions.backToSetup")}
              </Button>
            </CardFooter>
          </Card>
        </div>
      ) : props.status === "empty" ? (
        <Card>
          <CardContent className="p-0">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CircleOffIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("interview.review.emptyTitle")}</EmptyTitle>
                <EmptyDescription>{t("interview.review.emptyDescription")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={props.onBack} variant="outline">
                  <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
                  {t("interview.review.actions.backToSetup")}
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <Card role="alert">
          <CardHeader>
            <CardTitle>{t("interview.review.errorTitle")}</CardTitle>
            <CardDescription>{t("interview.review.errorDescription")}</CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-wrap gap-2">
            <Button disabled={props.isRetrying} onClick={props.onRetry}>
              {props.isRetrying ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
              )}
              {t("interview.review.actions.retry")}
            </Button>
            <Button onClick={props.onBack} variant="outline">
              <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
              {t("interview.review.actions.backToSetup")}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
