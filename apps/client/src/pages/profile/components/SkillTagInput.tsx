import { CodeXmlIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { normalizeSkillName, parseSkillNames } from "@/models/profile-text"
import type { ProfileSkill } from "@/models/profile"

type SkillTagInputProps = {
  availableSkills: ProfileSkill[]
  draftSkills: ProfileSkill[]
  onDraftSkillsChange: (skills: ProfileSkill[]) => void
  onSelectedSkillIdsChange: (ids: string[]) => void
  selectedSkillIds: string[]
}

function createDraftSkill(name: string): ProfileSkill {
  return { id: `draft_skill_${crypto.randomUUID()}`, name, source: "userAdded" }
}

export function SkillTagInput({
  availableSkills,
  draftSkills,
  onDraftSkillsChange,
  onSelectedSkillIdsChange,
  selectedSkillIds,
}: SkillTagInputProps) {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState("")
  const allSkills = [...availableSkills, ...draftSkills]
  const selectedSkills = selectedSkillIds
    .map((id) => allSkills.find((skill) => skill.id === id))
    .filter((skill): skill is ProfileSkill => Boolean(skill))
  const candidates = allSkills.filter((skill) => !selectedSkillIds.includes(skill.id))

  function addSkillByName(name: string) {
    const normalizedName = normalizeSkillName(name)
    if (!normalizedName) return

    const existing = allSkills.find((skill) => normalizeSkillName(skill.name) === normalizedName)
    const skill = existing ?? createDraftSkill(name.trim().replace(/\s+/g, " "))

    if (!existing) onDraftSkillsChange([...draftSkills, skill])
    if (!selectedSkillIds.includes(skill.id)) {
      onSelectedSkillIdsChange([...selectedSkillIds, skill.id])
    }
  }

  function addInputSkills() {
    parseSkillNames(inputValue).forEach(addSkillByName)
    setInputValue("")
  }

  return (
    <Field>
      <FieldLabel>{t("profile.field.skills")}</FieldLabel>
      <FieldDescription>{t("profile.editor.skillInputDescription")}</FieldDescription>
      <div className="flex flex-wrap gap-2">
        {selectedSkills.map((skill) => (
          <Badge className="h-7 bg-sky-100 text-primary dark:bg-sky-950" key={skill.id}>
            <CodeXmlIcon data-icon="inline-start" />
            {skill.name}
            <Button
              aria-label={t("profile.editor.removeSkill", { name: skill.name })}
              className="-mr-1 size-4 rounded-full p-0"
              onClick={() =>
                onSelectedSkillIdsChange(selectedSkillIds.filter((id) => id !== skill.id))
              }
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </Badge>
        ))}
      </div>
      <Combobox<ProfileSkill>
        items={candidates}
        itemToStringLabel={(skill) => skill.name}
        onInputValueChange={setInputValue}
        onValueChange={(skill: ProfileSkill | null) => {
          if (skill) {
            addSkillByName(skill.name)
            setInputValue("")
          }
        }}
        value={null}
      >
        <ComboboxInput
          aria-label={t("profile.editor.skillInputPlaceholder")}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !inputValue && selectedSkillIds.length) {
              onSelectedSkillIdsChange(selectedSkillIds.slice(0, -1))
            }
            if (event.key === "Enter" && inputValue.trim()) {
              event.preventDefault()
              addInputSkills()
            }
          }}
          placeholder={t("profile.editor.skillInputPlaceholder")}
          showClear={false}
          showTrigger={false}
          value={inputValue}
        />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxEmpty>{t("profile.editor.skillNotFound")}</ComboboxEmpty>
            {candidates.map((skill) => (
              <ComboboxItem key={skill.id} value={skill}>
                <CodeXmlIcon />
                {skill.name}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  )
}
