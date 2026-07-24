import { useTranslation } from "react-i18next"

import { PagePlaceholder } from "@/components/layout/PagePlaceholder"

export function InterviewSessionPage() {
  const { t } = useTranslation()

  return (
    <PagePlaceholder
      badge={t("interview.sessionPlaceholder.badge")}
      description={t("interview.sessionPlaceholder.description")}
      title={t("interview.sessionPlaceholder.title")}
    />
  )
}
