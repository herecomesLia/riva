import { SparklesIcon, TriangleAlertIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { TrainingRecordReferenceAnswer } from "@/models/training-records"

export function HistoryReferenceAnswer({
  isRequesting = false,
  onGenerate,
  referenceAnswer,
}: {
  isRequesting?: boolean
  onGenerate: () => void
  referenceAnswer: TrainingRecordReferenceAnswer
}) {
  const { i18n, t } = useTranslation()

  return (
    <Card className="min-w-0" data-testid={`history-reference-${referenceAnswer.status}`} size="sm">
      <CardHeader>
        <CardTitle>{t("history.detail.reference.title")}</CardTitle>
        <CardDescription>{t("history.detail.reference.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {referenceAnswer.status === "ready" && (
          <div className="flex min-w-0 flex-col gap-5">
            <ReferenceList
              items={referenceAnswer.content.recommendedStructure}
              ordered
              title={t("history.detail.reference.structure")}
            />
            <ReferenceList
              items={referenceAnswer.content.keyPoints}
              title={t("history.detail.reference.keyPoints")}
            />
            <section className="flex flex-col gap-2">
              <h4 className="font-heading text-sm font-medium">
                {t("history.detail.reference.example")}
              </h4>
              <p className="max-w-prose whitespace-pre-wrap text-sm leading-7">
                {referenceAnswer.content.exampleAnswer}
              </p>
            </section>
            <section className="flex flex-col gap-2">
              <h4 className="font-heading text-sm font-medium">
                {t("history.detail.reference.guidance")}
              </h4>
              <p className="text-sm leading-6 text-muted-foreground">
                {referenceAnswer.content.usageGuidance}
              </p>
            </section>
            <p className="text-xs text-muted-foreground">
              {t("history.detail.reference.generatedAt", {
                date: new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(referenceAnswer.content.generatedAt)),
              })}
            </p>
          </div>
        )}

        {referenceAnswer.status === "generating" && (
          <div className="flex flex-col items-start gap-4">
            <Alert role="status">
              <Spinner aria-hidden="true" />
              <AlertTitle>{t("history.detail.reference.generating")}</AlertTitle>
              <AlertDescription>
                {t("history.detail.reference.generatingDescription")}
              </AlertDescription>
            </Alert>
            <GenerateButton disabled onGenerate={onGenerate} />
          </div>
        )}

        {referenceAnswer.status === "pollingRetrying" && (
          <div className="flex flex-col items-start gap-4">
            <Alert role="status">
              <Spinner aria-hidden="true" />
              <AlertTitle>{t("history.detail.reference.pollingRetrying")}</AlertTitle>
              <AlertDescription>
                {t("history.detail.reference.pollingRetryingDescription")}
              </AlertDescription>
            </Alert>
            <GenerateButton disabled onGenerate={onGenerate} />
          </div>
        )}

        {referenceAnswer.status === "pollingFailed" && (
          <ReferenceUnavailable
            actionLabel={t("history.detail.reference.recheck")}
            description={t(
              `history.detail.reference.pollingFailedDescription.${referenceAnswer.reason}`,
            )}
            isRequesting={isRequesting}
            onGenerate={onGenerate}
            title={t("history.detail.reference.pollingFailed")}
          />
        )}

        {referenceAnswer.status === "unavailable" && (
          <ReferenceUnavailable
            description={t("history.detail.reference.unavailableDescription")}
            onGenerate={referenceAnswer.reason === "generationFailed" ? onGenerate : undefined}
            isRequesting={isRequesting}
            title={`${t("history.detail.reference.unavailable")} · ${t(
              `history.detail.reference.reason.${referenceAnswer.reason}`,
            )}`}
          />
        )}

        {referenceAnswer.status === "notRequested" && (
          <ReferenceUnavailable
            description={t("history.detail.reference.notRequestedDescription")}
            isRequesting={isRequesting}
            onGenerate={onGenerate}
            title={t("history.detail.reference.notRequested")}
          />
        )}
      </CardContent>
    </Card>
  )
}

function ReferenceUnavailable({
  actionLabel,
  description,
  isRequesting,
  onGenerate,
  title,
}: {
  actionLabel?: string
  description: string
  isRequesting: boolean
  onGenerate?: () => void
  title: string
}) {
  return (
    <div className="flex flex-col items-start gap-4">
      <Alert>
        <TriangleAlertIcon aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
      {onGenerate && (
        <GenerateButton
          label={actionLabel}
          disabled={isRequesting}
          onGenerate={onGenerate}
          showSpinner={isRequesting}
        />
      )}
    </div>
  )
}

function GenerateButton({
  disabled,
  label,
  onGenerate,
  showSpinner = false,
}: {
  disabled: boolean
  label?: string
  onGenerate: () => void
  showSpinner?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Button disabled={disabled} onClick={onGenerate} variant="outline">
      {showSpinner ? (
        <Spinner aria-hidden="true" data-icon="inline-start" />
      ) : (
        <SparklesIcon aria-hidden="true" data-icon="inline-start" />
      )}
      {showSpinner
        ? t("history.detail.reference.requesting")
        : (label ?? t("history.detail.reference.generate"))}
    </Button>
  )
}

function ReferenceList({
  items,
  ordered = false,
  title,
}: {
  items: string[]
  ordered?: boolean
  title: string
}) {
  const List = ordered ? "ol" : "ul"

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h4 className="font-heading text-sm font-medium">{title}</h4>
      <List className={`${ordered ? "list-decimal" : "list-disc"} pl-5 text-sm leading-6`}>
        {items.map((item) => (
          <li className="wrap-break-word" key={item}>
            {item}
          </li>
        ))}
      </List>
    </section>
  )
}
