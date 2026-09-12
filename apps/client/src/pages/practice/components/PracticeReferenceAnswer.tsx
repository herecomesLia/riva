import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDownIcon, SparklesIcon } from "lucide-react"

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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import type { ReferenceAnswerState } from "@/models/practice-workflow"

import type { PracticeInteractionResult } from "../practice-interaction"

type Props =
  | {
      mode: "answering"
      state: ReferenceAnswerState
      isPending: boolean
      interactionLocked: boolean
      assistedRetry: boolean
      onRequest: () => Promise<PracticeInteractionResult>
    }
  | {
      mode: "review" | "readonly"
      state: ReferenceAnswerState
      assistedRetry?: boolean
      isPending?: never
      interactionLocked?: never
      onRequest?: never
    }

export function PracticeReferenceAnswer(props: Props) {
  const { mode, state } = props
  const isPending = mode === "answering" ? props.isPending : false
  const interactionLocked = mode === "answering" ? props.interactionLocked : false
  const assistedRetry = props.assistedRetry ?? false
  const { t } = useTranslation()
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [requestError, setRequestError] = useState(false)
  const requestLock = useRef(false)

  async function confirmRequest() {
    if (mode !== "answering" || requestLock.current || isPending) return
    requestLock.current = true
    setRequestError(false)
    try {
      const result = await props.onRequest()
      if (result === "executed") setConfirmationOpen(false)
    } catch {
      setConfirmationOpen(false)
      setRequestError(true)
    } finally {
      requestLock.current = false
    }
  }

  return (
    <Card className="min-w-0" data-testid="practice-reference-answer">
      <CardHeader>
        <CardTitle>
          <h2>{t("practice.referenceAnswer.title")}</h2>
        </CardTitle>
        <CardDescription>{t("practice.referenceAnswer.description")}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        {requestError && (
          <Alert className="mb-4" variant="destructive">
            <AlertTitle>{t("practice.referenceAnswer.requestErrorTitle")}</AlertTitle>
            <AlertDescription>
              {t("practice.referenceAnswer.requestErrorDescription")}
            </AlertDescription>
          </Alert>
        )}

        {state.status === "notRequested" && mode === "answering" && (
          <Button
            disabled={interactionLocked || isPending}
            onClick={() => setConfirmationOpen(true)}
            type="button"
          >
            {isPending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <SparklesIcon aria-hidden="true" data-icon="inline-start" />
            )}
            {isPending
              ? t("practice.referenceAnswer.generating")
              : t("practice.referenceAnswer.request")}
          </Button>
        )}

        <PracticeReferenceAnswerContent assistedRetry={assistedRetry} mode={mode} state={state} />
      </CardContent>

      <AlertDialog onOpenChange={setConfirmationOpen} open={confirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("practice.referenceAnswer.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("practice.referenceAnswer.confirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t("practice.referenceAnswer.continueIndependently")}
            </AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={() => void confirmRequest()}>
              {isPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
              {isPending
                ? t("practice.referenceAnswer.generating")
                : t("practice.referenceAnswer.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export function PracticeReferenceAnswerContent({
  state,
  mode,
  assistedRetry = false,
  headingLevel = "h3",
}: {
  state: ReferenceAnswerState
  mode: "answering" | "review" | "readonly"
  assistedRetry?: boolean
  headingLevel?: "h3" | "h4"
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(mode === "answering")
  const showKindBadge = mode !== "review" || state.content?.kind === "technicalReference"
  const showViewedStatus = mode !== "review" && state.viewedBeforeSubmission

  return (
    <>
      {state.status === "unavailable" && (
        <p className="text-sm text-muted-foreground" role="status">
          {t("practice.referenceAnswer.unavailable")}
        </p>
      )}

      {state.status === "revealed" && (
        <Collapsible onOpenChange={setExpanded} open={mode === "review" || expanded}>
          <div className="flex min-w-0 flex-col gap-4">
            {(showKindBadge || showViewedStatus) && (
              <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                {showKindBadge && (
                  <Badge variant="secondary">
                    {t(`practice.referenceAnswer.kind.${state.content.kind}`)}
                  </Badge>
                )}
                {showViewedStatus && (
                  <Badge variant="outline">
                    {assistedRetry
                      ? t("practice.referenceAnswer.assistedRetry")
                      : t("practice.referenceAnswer.viewedBeforeSubmission")}
                  </Badge>
                )}
              </div>
            )}
            {mode === "readonly" && (
              <CollapsibleTrigger
                render={<Button size="sm" variant="outline" />}
                aria-label={
                  expanded
                    ? t("practice.referenceAnswer.collapse")
                    : t("practice.referenceAnswer.expand")
                }
              >
                <ChevronDownIcon data-icon="inline-start" />
                {expanded
                  ? t("practice.referenceAnswer.collapse")
                  : t("practice.referenceAnswer.expand")}
              </CollapsibleTrigger>
            )}
            <CollapsibleContent>
              {mode === "review" ? (
                <PracticeReviewReferenceSections content={state.content} />
              ) : (
                <div className="flex min-w-0 flex-col gap-5 break-words [overflow-wrap:anywhere]">
                  <p className="whitespace-pre-wrap text-sm leading-7">{state.content.answer}</p>
                  <ReferenceList
                    heading={headingLevel}
                    items={state.content.keyPoints}
                    title={t("practice.referenceAnswer.keyPoints")}
                  />
                  <ReferenceList
                    heading={headingLevel}
                    items={state.content.commonMistakes}
                    title={t("practice.referenceAnswer.commonMistakes")}
                  />
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t(`practice.referenceAnswer.disclaimer.${state.content.kind}`)}
                  </p>
                </div>
              )}
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </>
  )
}

export function PracticeReviewReferenceSections({
  content,
  addressedGap,
}: {
  content: {
    answer: string
    keyPoints: string[]
    commonMistakes: string[]
  }
  addressedGap?: string
}) {
  const { t } = useTranslation()

  return (
    <div className="flex min-w-0 flex-col break-words [overflow-wrap:anywhere]">
      <section className="flex min-w-0 flex-col gap-2 pb-5">
        <h4 className="font-heading text-sm font-medium">
          {t("practice.questionReview.referenceAnswer")}
        </h4>
        <p className="text-xs leading-5 text-muted-foreground">
          {t("practice.questionReview.aiGeneratedDisclaimer")}
        </p>
        {addressedGap ? <p className="text-sm text-muted-foreground">{addressedGap}</p> : null}
        <p className="whitespace-pre-wrap text-sm leading-7">{content.answer}</p>
      </section>
      <Separator />
      <div className="py-5">
        <ReferenceList
          heading="h4"
          items={content.keyPoints}
          title={t("practice.questionReview.keyPoints")}
        />
      </div>
      <Separator />
      <div className="pt-5">
        <ReferenceList
          heading="h4"
          items={content.commonMistakes}
          title={t("practice.questionReview.commonMistakes")}
        />
      </div>
    </div>
  )
}

function ReferenceList({
  items,
  title,
  heading: Heading,
}: {
  items: string[]
  title: string
  heading: "h3" | "h4"
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <Heading className="font-heading text-sm font-medium">{title}</Heading>
      <ul className="list-disc pl-5 text-sm leading-6">
        {items.map((item) => (
          <li className="break-words [overflow-wrap:anywhere]" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}
