import { useTranslation } from "react-i18next"

import { PagePlaceholder } from "@/components/layout/PagePlaceholder"

export function InterviewPage() {
  const { t } = useTranslation()

  return (
    <PagePlaceholder
      badge={t("placeholderPages.interview.badge")}
      description={t("placeholderPages.interview.description")}
      title={t("placeholderPages.interview.title")}
    />
  )
}
