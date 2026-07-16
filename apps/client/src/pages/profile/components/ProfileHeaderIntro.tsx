import { useTranslation } from "react-i18next"

export function ProfileHeaderIntro() {
  const { t } = useTranslation()

  return (
    <>
      <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
        {t("profile.title")}
      </h1>
      <p className="max-w-3xl text-base leading-7 text-muted-foreground">
        {t("profile.description")}
      </p>
    </>
  )
}
