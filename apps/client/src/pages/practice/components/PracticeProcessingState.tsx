import { useTranslation } from "react-i18next"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

export function PracticeProcessingState() {
  const { t } = useTranslation()

  return (
    <Card aria-busy="true" role="status" data-testid="practice-processing-status">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Spinner aria-hidden="true" />
          {t("practice.processing.title")}
        </CardTitle>
        <CardDescription>{t("practice.processing.description")}</CardDescription>
      </CardHeader>
    </Card>
  )
}
