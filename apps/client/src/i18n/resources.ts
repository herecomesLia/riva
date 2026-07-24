import { app as enApp } from "./locales/en/app"
import { appShell as enAppShell } from "./locales/en/app-shell"
import { common as enCommon } from "./locales/en/common"
import { dashboard as enDashboard } from "./locales/en/dashboard"
import { history as enHistory } from "./locales/en/history"
import { interview as enInterview } from "./locales/en/interview"
import { login as enLogin } from "./locales/en/login"
import { notFound as enNotFound } from "./locales/en/not-found"
import { placeholderPages as enPlaceholderPages } from "./locales/en/placeholder-pages"
import { practice as enPractice } from "./locales/en/practice"
import { profile as enProfile } from "./locales/en/profile"
import { roles as enRoles } from "./locales/en/roles"
import { app as zhCNApp } from "./locales/zh-CN/app"
import { appShell as zhCNAppShell } from "./locales/zh-CN/app-shell"
import { common as zhCNCommon } from "./locales/zh-CN/common"
import { dashboard as zhCNDashboard } from "./locales/zh-CN/dashboard"
import { history as zhCNHistory } from "./locales/zh-CN/history"
import { interview as zhCNInterview } from "./locales/zh-CN/interview"
import { login as zhCNLogin } from "./locales/zh-CN/login"
import { notFound as zhCNNotFound } from "./locales/zh-CN/not-found"
import { placeholderPages as zhCNPlaceholderPages } from "./locales/zh-CN/placeholder-pages"
import { practice as zhCNPractice } from "./locales/zh-CN/practice"
import { profile as zhCNProfile } from "./locales/zh-CN/profile"
import { roles as zhCNRoles } from "./locales/zh-CN/roles"

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
      history: zhCNHistory,
      interview: zhCNInterview,
      login: zhCNLogin,
      notFound: zhCNNotFound,
      placeholderPages: zhCNPlaceholderPages,
      practice: zhCNPractice,
      profile: zhCNProfile,
      roles: zhCNRoles,
    },
  },
  zh: {
    translation: {
      app: zhCNApp,
      appShell: zhCNAppShell,
      common: zhCNCommon,
      dashboard: zhCNDashboard,
      history: zhCNHistory,
      interview: zhCNInterview,
      login: zhCNLogin,
      notFound: zhCNNotFound,
      placeholderPages: zhCNPlaceholderPages,
      practice: zhCNPractice,
      profile: zhCNProfile,
      roles: zhCNRoles,
    },
  },
  en: {
    translation: {
      app: enApp,
      appShell: enAppShell,
      common: enCommon,
      dashboard: enDashboard,
      history: enHistory,
      interview: enInterview,
      login: enLogin,
      notFound: enNotFound,
      placeholderPages: enPlaceholderPages,
      practice: enPractice,
      profile: enProfile,
      roles: enRoles,
    },
  },
} as const
