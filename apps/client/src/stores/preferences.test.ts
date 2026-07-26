import { beforeEach, describe, expect, it } from "vitest"

import { defaultThemePreference } from "@/app/theme"
import { defaultLanguage } from "@/i18n/resources"
import { normalizeLanguagePreference, usePreferencesStore } from "@/stores/preferences"
import { resetStores } from "@/test/stores"

describe("preferences store", () => {
  beforeEach(() => {
    resetStores()
  })

  it("normalizes supported languages", () => {
    expect(normalizeLanguagePreference("zh-CN")).toBe("zh-CN")
    expect(normalizeLanguagePreference("en")).toBe("en")
  })

  it("normalizes zh to the default language", () => {
    expect(normalizeLanguagePreference("zh")).toBe(defaultLanguage)
  })

  it("normalizes unknown or missing languages to the default language", () => {
    expect(normalizeLanguagePreference("fr")).toBe(defaultLanguage)
    expect(normalizeLanguagePreference(undefined)).toBe(defaultLanguage)
  })

  it("resets to initial preferences between tests", () => {
    expect(usePreferencesStore.getState()).toMatchObject({
      language: defaultLanguage,
      themePreference: defaultThemePreference,
    })
  })
})
