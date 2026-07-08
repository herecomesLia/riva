import "react-i18next"

import type { defaultLanguage, resources } from "./resources"

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: (typeof resources)[typeof defaultLanguage]["translation"]
  }
}
