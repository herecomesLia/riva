import { BriefcaseBusinessIcon, SparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function RoleCreationMethodDialog({
  onChooseImport,
  onChooseManual,
  onOpenChange,
  open,
}: {
  onChooseImport: () => void
  onChooseManual: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { t } = useTranslation()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("roles.creationMethod.title")}</DialogTitle>
          <DialogDescription>{t("roles.creationMethod.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BriefcaseBusinessIcon />
                {t("roles.creationMethod.manual.title")}
              </CardTitle>
              <CardDescription>{t("roles.creationMethod.manual.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{t("roles.creationMethod.manual.detail")}</p>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={onChooseManual} variant="outline">
                {t("roles.creationMethod.manual.action")}
              </Button>
            </CardFooter>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SparklesIcon />
                {t("roles.creationMethod.import.title")}
              </CardTitle>
              <CardDescription>{t("roles.creationMethod.import.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{t("roles.creationMethod.import.detail")}</p>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={onChooseImport}>
                <SparklesIcon data-icon="inline-start" />
                {t("roles.creationMethod.import.action")}
              </Button>
            </CardFooter>
          </Card>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {t("roles.creationMethod.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
