import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Profile, ProfileContent, ProfileSection } from "@/models/profile"

import { ProfileSectionEditor } from "./ProfileSectionEditor"
import { ProfileSkillsEditor } from "./ProfileSkillsEditor"

type ProfileSectionEditDialogProps = {
  onDirtyChange: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  onSave: (content: ProfileContent) => Promise<void>
  open: boolean
  profile: Profile
  section: ProfileSection | null
}

export function ProfileSectionEditDialog({
  onDirtyChange,
  onOpenChange,
  onSave,
  open,
  profile,
  section,
}: ProfileSectionEditDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        {section && (
          <>
            <DialogHeader className="border-b px-6 py-5 pr-14">
              <DialogTitle className="text-xl font-semibold leading-tight">
                {t("profile.editor.dialogTitle", { section: t(`profile.sections.${section}`) })}
              </DialogTitle>
              <DialogDescription>{t("profile.editor.dialogDescription")}</DialogDescription>
            </DialogHeader>
            {section === "skills" ? (
              <ProfileSkillsEditor
                onCancel={() => onOpenChange(false)}
                onDirtyChange={onDirtyChange}
                onSave={onSave}
                profile={profile}
              />
            ) : (
              <ProfileSectionEditor
                key={section}
                onCancel={() => onOpenChange(false)}
                onDirtyChange={onDirtyChange}
                onSave={onSave}
                profile={profile}
                section={section}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
