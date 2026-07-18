import { PlusIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

export function RolesHeader({
  disabled = false,
  onAdd,
}: {
  disabled?: boolean
  onAdd?: () => void
}) {
  const { t } = useTranslation()

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight text-foreground">
          {t("roles.title")}
        </h1>
        <p className="text-base leading-7 text-muted-foreground">{t("roles.description")}</p>
      </div>
      <Button disabled={disabled || !onAdd} onClick={onAdd}>
        <PlusIcon data-icon="inline-start" />
        {t("roles.actions.add")}
      </Button>
    </header>
  )
}
