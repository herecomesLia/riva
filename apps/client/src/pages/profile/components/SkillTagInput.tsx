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
import { normalizeSkillName, parseSkillNames } from "../skill-names"

type SkillTagInputProps = {
  availableSkills: string[]
  description: string
  label: string
  onSelectedSkillsChange: (skills: string[]) => void
  selectedSkills: string[]
}

export function SkillTagInput({
  availableSkills,
  description,
  label,
  onSelectedSkillsChange,
  selectedSkills,
}: SkillTagInputProps) {
  const { t } = useTranslation()
  const [hasDuplicate, setHasDuplicate] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const selectedNames = new Set(selectedSkills.map(normalizeSkillName))
  const candidates = availableSkills.filter(
    (skill) => !selectedNames.has(normalizeSkillName(skill)),
  )

  function addSkillsByName(names: string[]) {
    if (names.some((name) => selectedNames.has(normalizeSkillName(name)))) {
      setHasDuplicate(true)
      return false
    }

    const nextSkills = [...selectedSkills]
    names.forEach((name) => {
      const normalizedName = normalizeSkillName(name)
      if (!normalizedName) return

      const existing = availableSkills.find((skill) => normalizeSkillName(skill) === normalizedName)
      nextSkills.push(existing ?? name.trim().replace(/\s+/g, " "))
    })

    if (nextSkills.length !== selectedSkills.length) onSelectedSkillsChange(nextSkills)
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
          <Badge className="h-7 bg-sky-100 text-primary dark:bg-sky-950" key={skill}>
            {skill}
            <Button
              aria-label={t("profile.editor.removeSkill", { name: skill })}
              className="-mr-1 size-4 rounded-full p-0"
              onClick={() => {
                setHasDuplicate(false)
                onSelectedSkillsChange(selectedSkills.filter((name) => name !== skill))
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
      <Combobox<string>
        items={candidates}
        itemToStringLabel={(skill) => skill}
        onInputValueChange={setInputValue}
        onValueChange={(skill) => {
          if (skill && addSkillsByName([skill])) setInputValue("")
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
              <ComboboxItem key={skill} value={skill}>
                <CodeXmlIcon />
                {skill}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldError>{t("profile.editor.validation.duplicateSkill")}</FieldError>
    </Field>
  )
}
