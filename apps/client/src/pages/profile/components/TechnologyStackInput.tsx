import { XIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  normalizeSkillName,
  normalizeTechnologyStack,
  parseTechnologyNames,
} from "@/models/profile-text"

type TechnologyStackInputProps = {
  description: string
  label: string
  onChange: (technologies: string[]) => void
  technologies: string[]
}

export function TechnologyStackInput({
  description,
  label,
  onChange,
  technologies,
}: TechnologyStackInputProps) {
  const { t } = useTranslation()
  const [hasDuplicate, setHasDuplicate] = useState(false)
  const [inputValue, setInputValue] = useState("")

  function addInputTechnologies() {
    const inputTechnologies = parseTechnologyNames(inputValue)
    const existingTechnologies = new Set(technologies.map(normalizeSkillName))

    if (
      inputTechnologies.some((technology) =>
        existingTechnologies.has(normalizeSkillName(technology)),
      )
    ) {
      setHasDuplicate(true)
      return
    }

    onChange(normalizeTechnologyStack([...technologies, ...inputTechnologies]))
    setHasDuplicate(false)
    setInputValue("")
  }

  return (
    <Field invalid={hasDuplicate}>
      <FieldLabel className="text-foreground">{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <div className="flex flex-wrap gap-2">
        {technologies.map((technology) => (
          <Badge className="h-7 bg-sky-100 text-primary dark:bg-sky-950" key={technology}>
            {technology}
            <Button
              aria-label={t("profile.editor.removeTechnology", { name: technology })}
              className="-mr-1 size-4 rounded-full p-0"
              onClick={() => {
                setHasDuplicate(false)
                onChange(technologies.filter((item) => item !== technology))
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
      <FieldControl>
        <Input
          aria-label={t("profile.editor.technologyInputPlaceholder")}
          onChange={(event) => {
            setInputValue(event.target.value)
            setHasDuplicate(false)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && inputValue.trim()) {
              event.preventDefault()
              addInputTechnologies()
            }
          }}
          placeholder={t("profile.editor.technologyInputPlaceholder")}
          value={inputValue}
        />
      </FieldControl>
      <FieldError>{t("profile.editor.validation.duplicateTechnology")}</FieldError>
    </Field>
  )
}
