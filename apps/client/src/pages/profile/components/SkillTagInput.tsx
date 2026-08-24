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

type SkillTagInputProps = {
  availableSkills: string[]
  description: string
  label: string
  onAvailableSkillsChange: (skills: string[]) => void
  onSelectedSkillsChange: (skills: string[]) => void
  selectedSkills: string[]
}

export function SkillTagInput({
  availableSkills,
  description,
  label,
  onAvailableSkillsChange,
  onSelectedSkillsChange,
  selectedSkills,
}: SkillTagInputProps) {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState("")
  const selectedKeys = new Set(selectedSkills.map(normalizeSkillName))
  const candidates = availableSkills.filter((skill) => !selectedKeys.has(normalizeSkillName(skill)))

  function addSkills(names: string[]) {
    const nextAvailableSkills = [...availableSkills]
    const nextSelectedSkills = [...selectedSkills]
    const nextSelectedKeys = new Set(selectedKeys)

    for (const name of names) {
      const trimmedName = name.trim()
      const normalizedName = normalizeSkillName(trimmedName)
      if (!normalizedName || nextSelectedKeys.has(normalizedName)) continue

      const existing = nextAvailableSkills.find(
        (skill) => normalizeSkillName(skill) === normalizedName,
      )
      if (existing === undefined) nextAvailableSkills.push(trimmedName)
      nextSelectedSkills.push(existing ?? trimmedName)
      nextSelectedKeys.add(normalizedName)
    }

    onAvailableSkillsChange(nextAvailableSkills)
    onSelectedSkillsChange(nextSelectedSkills)
  }

  function addInputSkills() {
    addSkills(parseSkillNames(inputValue))
    setInputValue("")
  }

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <div className="flex flex-wrap gap-2">
        {selectedSkills.map((skill) => (
          <Badge className="h-7 bg-sky-100 text-primary dark:bg-sky-950" key={skill}>
            {skill}
            <Button
              aria-label={t("profile.editor.removeSkill", { name: skill })}
              className="-mr-1 size-4 rounded-full p-0"
              onClick={() =>
                onSelectedSkillsChange(
                  selectedSkills.filter(
                    (candidate) => normalizeSkillName(candidate) !== normalizeSkillName(skill),
                  ),
                )
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
      <Combobox<string>
        items={candidates}
        itemToStringLabel={(skill) => skill}
        onInputValueChange={setInputValue}
        onValueChange={(skill) => {
          if (skill) {
            addSkills([skill])
            setInputValue("")
          }
        }}
        value={null}
      >
        <ComboboxInput
          aria-label={t("profile.editor.skillInputPlaceholder")}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !inputValue && selectedSkills.length) {
              onSelectedSkillsChange(selectedSkills.slice(0, -1))
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
              <ComboboxItem key={skill} value={skill}>
                <CodeXmlIcon />
                {skill}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  )
}
