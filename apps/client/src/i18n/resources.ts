import { app as enApp } from "./locales/en/app"
import { appShell as enAppShell } from "./locales/en/app-shell"
import { common as enCommon } from "./locales/en/common"
import { dashboard as enDashboard } from "./locales/en/dashboard"
import { login as enLogin } from "./locales/en/login"
import { app as zhCNApp } from "./locales/zh-CN/app"
import { appShell as zhCNAppShell } from "./locales/zh-CN/app-shell"
import { common as zhCNCommon } from "./locales/zh-CN/common"
import { dashboard as zhCNDashboard } from "./locales/zh-CN/dashboard"
import { login as zhCNLogin } from "./locales/zh-CN/login"

export const defaultLanguage = "zh-CN"

export const supportedLanguages = ["zh-CN", "en"] as const

export type SupportedLanguage = (typeof supportedLanguages)[number]

export const i18nSupportedLanguages = [...supportedLanguages, "zh"] as const

export const resources = {
  "zh-CN": {
    translation: {
      app: zhCNApp,
      appShell: zhCNAppShell,
      common: zhCNCommon,
      dashboard: zhCNDashboard,
      login: zhCNLogin,
    },
  },
  zh: {
    translation: {
      app: zhCNApp,
      appShell: zhCNAppShell,
      common: zhCNCommon,
      dashboard: zhCNDashboard,
      login: zhCNLogin,
    },
  },
  en: {
    translation: {
      app: enApp,
      appShell: enAppShell,
      common: enCommon,
      dashboard: enDashboard,
      login: enLogin,
    },
  },
} as const
