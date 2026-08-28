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
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { normalizeSkillName, parseSkillNames } from "@/models/profile-text"
import type { ProfileSkill } from "@/models/profile"

type SkillTagInputProps = {
  availableSkills: ProfileSkill[]
  description: string
  draftSkills: ProfileSkill[]
  label: string
  onDraftSkillsChange: (skills: ProfileSkill[]) => void
  onSelectedSkillIdsChange: (ids: string[]) => void
  selectedSkillIds: string[]
}

function createDraftSkill(name: string): ProfileSkill {
  return { id: `draft_skill_${crypto.randomUUID()}`, name, source: "userAdded" }
}

export function SkillTagInput({
  availableSkills,
  description,
  draftSkills,
  label,
  onDraftSkillsChange,
  onSelectedSkillIdsChange,
  selectedSkillIds,
}: SkillTagInputProps) {
  const { t } = useTranslation()
  const [hasDuplicate, setHasDuplicate] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const allSkills = [...availableSkills, ...draftSkills]
  const selectedSkills = selectedSkillIds
    .map((id) => allSkills.find((skill) => skill.id === id))
    .filter((skill): skill is ProfileSkill => Boolean(skill))
  const candidates = allSkills.filter((skill) => !selectedSkillIds.includes(skill.id))

  function addSkillsByName(names: string[]) {
    const selectedNames = new Set(selectedSkills.map((skill) => normalizeSkillName(skill.name)))
    if (names.some((name) => selectedNames.has(normalizeSkillName(name)))) {
      setHasDuplicate(true)
      return false
    }

    const nextDraftSkills = [...draftSkills]
    const nextSelectedSkillIds = [...selectedSkillIds]

    names.forEach((name) => {
      const normalizedName = normalizeSkillName(name)
      if (!normalizedName) return

      const existing = [...availableSkills, ...nextDraftSkills].find(
        (skill) => normalizeSkillName(skill.name) === normalizedName,
      )
      const skill = existing ?? createDraftSkill(name.trim().replace(/\s+/g, " "))

      if (!existing) nextDraftSkills.push(skill)
      if (!nextSelectedSkillIds.includes(skill.id)) nextSelectedSkillIds.push(skill.id)
    })

    if (nextDraftSkills.length !== draftSkills.length) onDraftSkillsChange(nextDraftSkills)
    if (nextSelectedSkillIds.length !== selectedSkillIds.length) {
      onSelectedSkillIdsChange(nextSelectedSkillIds)
    }
    setHasDuplicate(false)
    return true
  }

  function addInputSkills() {
    if (addSkillsByName(parseSkillNames(inputValue))) setInputValue("")
  }

  return (
    <Field invalid={hasDuplicate}>
      <FieldLabel className="text-foreground">{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <div className="flex flex-wrap gap-2">
        {selectedSkills.map((skill) => (
          <Badge className="h-7 bg-sky-100 text-primary dark:bg-sky-950" key={skill.id}>
            {skill.name}
            <Button
              aria-label={t("profile.editor.removeSkill", { name: skill.name })}
              className="-mr-1 size-4 rounded-full p-0"
              onClick={() => {
                setHasDuplicate(false)
                onSelectedSkillIdsChange(selectedSkillIds.filter((id) => id !== skill.id))
              }}
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
          if (skill && addSkillsByName([skill.name])) setInputValue("")
        }}
        value={null}
      >
        <FieldControl>
          <ComboboxInput
            aria-label={t("profile.editor.skillInputPlaceholder")}
            onChange={() => setHasDuplicate(false)}
            onKeyDown={(event) => {
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
        </FieldControl>
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
      <FieldError>{t("profile.editor.validation.duplicateSkill")}</FieldError>
    </Field>
  )
}
