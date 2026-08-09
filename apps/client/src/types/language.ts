export const interactionLanguages = ["zh-CN", "en"] as const

export type InteractionLanguage = (typeof interactionLanguages)[number]
