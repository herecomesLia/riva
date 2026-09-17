import { useState } from "react"
import { useTranslation } from "react-i18next"
import { SparklesIcon } from "lucide-react"

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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function PracticeReferenceAnswer({ referenceAnswer }: { referenceAnswer: string }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  return (
    <Card className="min-w-0" data-testid="practice-reference-answer">
      <CardHeader>
        <CardTitle>
          <h2>{t("practice.referenceAnswer.title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <Button
          className="self-start"
          aria-expanded={expanded}
          onClick={() => (expanded ? setExpanded(false) : setConfirmationOpen(true))}
          type="button"
        >
          <SparklesIcon aria-hidden="true" data-icon="inline-start" />
          {expanded ? t("practice.referenceAnswer.collapse") : t("practice.referenceAnswer.view")}
        </Button>
        {expanded && (
          <div className="flex min-w-0 flex-col gap-3 break-words [overflow-wrap:anywhere]">
            <p className="whitespace-pre-wrap text-sm leading-7">{referenceAnswer}</p>
            <p className="text-xs text-muted-foreground">
              {t("practice.questionReview.aiGeneratedDisclaimer")}
            </p>
          </div>
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
            <AlertDialogCancel>
              {t("practice.referenceAnswer.continueIndependently")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setExpanded(true)
                setConfirmationOpen(false)
              }}
            >
              {t("practice.referenceAnswer.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
