import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { InterviewConversationItem } from "@/models/interview-workflow"

type InterviewConversationHistoryProps = {
  records: readonly InterviewConversationItem[]
}

export function InterviewConversationHistory({ records }: InterviewConversationHistoryProps) {
  const { t } = useTranslation()
  if (records.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("interview.session.history.title")}</CardTitle>
        <CardDescription>
          {t("interview.session.history.description", { count: records.length })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-5">
          {records.map((record, index) => (
            <li
              className="flex min-w-0 flex-col gap-3"
              key={`${record.kind}-${record.questionOrder}-${index}`}
            >
              {index > 0 ? <Separator /> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={record.kind === "followUp" ? "outline" : "secondary"}>
                  {t(`interview.session.promptKinds.${record.kind}`)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t("interview.session.history.questionNumber", {
                    current: record.questionOrder,
                  })}
                </span>
              </div>
              <p className="break-words font-medium leading-7">{record.prompt}</p>
              <div className="rounded-lg bg-muted p-4">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("interview.session.history.answer")}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm leading-7">{record.answer}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
