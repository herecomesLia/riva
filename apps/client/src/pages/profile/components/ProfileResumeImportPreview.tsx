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
import type { ProfileContent } from "@/models/profile"

import { ProfileSkillBadge } from "./ProfileSkillBadge"

export function ProfileResumeImportPreview({
  content,
  isSaving,
  onCancel,
  onSave,
}: {
  content: ProfileContent
  isSaving: boolean
  onCancel: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  return (
    <Card data-testid="profile-resume-import-preview">
      <CardHeader>
        <CardTitle>{t("profile.importPreview.title")}</CardTitle>
        <CardDescription>{t("profile.importPreview.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {content.summary && (
          <section className="sm:col-span-2">
            <h3 className="mb-2 font-medium">{t("profile.sections.summary")}</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{content.summary}</p>
          </section>
        )}
        <PreviewList
          count={content.education.length}
          label={t("profile.sections.education")}
          values={content.education.map((item) => item.school)}
        />
        <PreviewList
          count={content.workExperiences.length}
          label={t("profile.sections.workExperience")}
          values={content.workExperiences.map((item) => `${item.title} · ${item.company}`)}
        />
        <PreviewList
          count={content.projectExperiences.length}
          label={t("profile.sections.projectExperience")}
          values={content.projectExperiences.map((item) => item.name)}
        />
        <section>
          <h3 className="mb-2 font-medium">{t("profile.sections.skills")}</h3>
          <div className="flex flex-wrap gap-2">
            {content.skills.map((skill) => (
              <ProfileSkillBadge key={skill} name={skill} />
            ))}
          </div>
        </section>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button onClick={onCancel} variant="outline">
          {t("profile.dialog.discardChanges")}
        </Button>
        <Button disabled={isSaving} onClick={onSave}>
          {t("profile.importPreview.apply")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function PreviewList({ count, label, values }: { count: number; label: string; values: string[] }) {
  return (
    <section>
      <h3 className="mb-2 font-medium">
        {label} · {count}
      </h3>
      {values.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </section>
  )
}
