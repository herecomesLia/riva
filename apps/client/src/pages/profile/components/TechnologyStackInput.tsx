import { XIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldControl, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { normalizeTechnologyStack, parseTechnologyNames } from "@/models/profile-text"

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
  const [inputValue, setInputValue] = useState("")

  function addInputTechnologies() {
    onChange(normalizeTechnologyStack([...technologies, ...parseTechnologyNames(inputValue)]))
    setInputValue("")
  }

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <div className="flex flex-wrap gap-2">
        {technologies.map((technology) => (
          <Badge className="h-7 bg-sky-100 text-primary dark:bg-sky-950" key={technology}>
            {technology}
            <Button
              aria-label={t("profile.editor.removeTechnology", { name: technology })}
              className="-mr-1 size-4 rounded-full p-0"
              onClick={() => onChange(technologies.filter((item) => item !== technology))}
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
          onChange={(event) => setInputValue(event.target.value)}
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
    </Field>
  )
}
