import { Link } from "@tanstack/react-router"
import { SparklesIcon, TriangleAlertIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { InterviewEntrySearch, PracticeEntrySearch } from "@/app/training-entry-search"
import type { TrainingRecordReferenceAnswer } from "@/models/training-records"

export function HistoryReferenceAnswer({
  generateLink,
  referenceAnswer,
}: {
  generateLink:
    | { to: "/practice"; search: PracticeEntrySearch }
    | { to: "/interview"; search: InterviewEntrySearch }
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
          <Alert role="status">
            <Spinner aria-hidden="true" />
            <AlertTitle>{t("history.detail.reference.generating")}</AlertTitle>
            <AlertDescription>
              {t("history.detail.reference.generatingDescription")}
            </AlertDescription>
          </Alert>
        )}

        {referenceAnswer.status === "unavailable" && (
          <ReferenceUnavailable
            description={t("history.detail.reference.unavailableDescription")}
            generateLink={generateLink}
            title={`${t("history.detail.reference.unavailable")} · ${t(
              `history.detail.reference.reason.${referenceAnswer.reason}`,
            )}`}
          />
        )}

        {referenceAnswer.status === "notRequested" && (
          <ReferenceUnavailable
            description={t("history.detail.reference.notRequestedDescription")}
            generateLink={generateLink}
            title={t("history.detail.reference.notRequested")}
          />
        )}
      </CardContent>
    </Card>
  )
}

function ReferenceUnavailable({
  description,
  generateLink,
  title,
}: {
  description: string
  generateLink:
    | { to: "/practice"; search: PracticeEntrySearch }
    | { to: "/interview"; search: InterviewEntrySearch }
  title: string
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-start gap-4">
      <Alert>
        <TriangleAlertIcon aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
      <Button
        nativeButton={false}
        render={
          generateLink.to === "/practice" ? (
            <Link search={generateLink.search} to="/practice" />
          ) : (
            <Link search={generateLink.search} to="/interview" />
          )
        }
        variant="outline"
      >
        <SparklesIcon aria-hidden="true" data-icon="inline-start" />
        {t("history.detail.reference.generate")}
      </Button>
    </div>
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
