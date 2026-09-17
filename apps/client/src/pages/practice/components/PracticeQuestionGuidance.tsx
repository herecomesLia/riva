import { LightbulbIcon, ListTreeIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import type { PracticeGuidance } from "@/api/generated/models"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

export function PracticeQuestionGuidance({ hints, framework }: PracticeGuidance) {
  const { t } = useTranslation()
  return (
    <section className="grid gap-4 md:grid-cols-2" aria-label={t("practice.guidance.title")}>
      <GuidanceCard
        content={hints}
        description={t("practice.guidance.hintDescription")}
        icon={LightbulbIcon}
        title={t("practice.guidance.hintTitle")}
        expandLabel={t("practice.guidance.viewHint")}
        emptyLabel={t("practice.guidance.hintEmpty")}
      />
      <GuidanceCard
        content={framework}
        description={t("practice.guidance.frameworkDescription")}
        icon={ListTreeIcon}
        title={t("practice.guidance.frameworkTitle")}
        expandLabel={t("practice.guidance.viewFramework")}
        emptyLabel={t("practice.guidance.frameworkEmpty")}
      />
    </section>
  )
}

function GuidanceCard({
  content,
  description,
  icon: Icon,
  title,
  expandLabel,
  emptyLabel,
}: {
  content: string[]
  description: string
  icon: typeof LightbulbIcon
  title: string
  expandLabel: string
  emptyLabel: string
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Collapsible open={expanded} onOpenChange={setExpanded} className="flex flex-col gap-4">
          <CollapsibleTrigger render={<Button type="button" variant="outline" />}>
            {expanded ? t("practice.guidance.collapse") : expandLabel}
          </CollapsibleTrigger>
          <CollapsibleContent>
            {content.length > 0 ? (
              <ul
                className="flex list-disc flex-col gap-2 pl-5 text-sm break-words [overflow-wrap:anywhere]"
                data-testid="practice-guidance-content"
              >
                {content.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
