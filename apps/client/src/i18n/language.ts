import { i18n } from "./i18n"
import { defaultLanguage } from "./resources"
import type { InteractionLanguage } from "@/types/language"

export type { InteractionLanguage }

export function normalizeInteractionLanguage(
  value: string | null | undefined,
): InteractionLanguage {
  const candidate = value?.split(",", 1)[0]?.split(";", 1)[0]?.trim().toLowerCase()

  if (candidate === "zh" || candidate?.startsWith("zh-")) return "zh-CN"
  if (candidate === "en" || candidate?.startsWith("en-")) return "en"
  return defaultLanguage
}

export function getCurrentInteractionLanguage(): InteractionLanguage {
  return normalizeInteractionLanguage(i18n.resolvedLanguage ?? i18n.language)
}
