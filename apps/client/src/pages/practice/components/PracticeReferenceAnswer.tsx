import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDownIcon } from "lucide-react"

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
import { Spinner } from "@/components/ui/spinner"
import type { PracticeReferenceAnswerState } from "@/models/practice"

import type { PracticeInteractionResult } from "../practice-interaction"

type Props = {
  state: PracticeReferenceAnswerState
  mode?: "answering" | "review" | "readonly"
  isPending?: boolean
  interactionLocked?: boolean
  assistedRetry?: boolean
  onRequest?: () => Promise<PracticeInteractionResult>
}

export function PracticeReferenceAnswer({
  state,
  mode = "answering",
  isPending = false,
  interactionLocked = false,
  assistedRetry = false,
  onRequest,
}: Props) {
  const { t } = useTranslation()
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [requestError, setRequestError] = useState(false)
  const requestLock = useRef(false)
  const [expanded, setExpanded] = useState(mode === "answering")

  async function confirmRequest() {
    if (!onRequest || requestLock.current || isPending) return
    requestLock.current = true
    setRequestError(false)
    try {
      const result = await onRequest()
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
            {isPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {isPending
              ? t("practice.referenceAnswer.generating")
              : t("practice.referenceAnswer.request")}
          </Button>
        )}

        {state.status === "unavailable" && (
          <p className="text-sm text-muted-foreground" role="status">
            {t("practice.referenceAnswer.unavailable")}
          </p>
        )}

        {state.status === "revealed" && (
          <Collapsible onOpenChange={setExpanded} open={expanded}>
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                <Badge variant="secondary">
                  {t(`practice.referenceAnswer.kind.${state.content.kind}`)}
                </Badge>
                {state.viewedBeforeSubmission && (
                  <Badge variant="outline">
                    {assistedRetry
                      ? t("practice.referenceAnswer.assistedRetry")
                      : t("practice.referenceAnswer.viewedBeforeSubmission")}
                  </Badge>
                )}
              </div>
              {mode !== "answering" && (
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
                <div className="flex min-w-0 flex-col gap-5 break-words [overflow-wrap:anywhere]">
                  <p className="whitespace-pre-wrap text-sm leading-7">{state.content.answer}</p>
                  <ReferenceList
                    items={state.content.keyPoints}
                    title={t("practice.referenceAnswer.keyPoints")}
                  />
                  <ReferenceList
                    items={state.content.commonMistakes}
                    title={t("practice.referenceAnswer.commonMistakes")}
                  />
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t(`practice.referenceAnswer.disclaimer.${state.content.kind}`)}
                  </p>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}
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

function ReferenceList({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="font-heading text-sm font-medium">{title}</h3>
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
