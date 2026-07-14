import preview from "#storybook/preview"

import { ProfileCompletenessRing } from "./ProfileCompletenessRing"

const meta = preview.meta({
  component: ProfileCompletenessRing,
  title: "Profile/ProfileCompletenessRing",
})

export const Empty = meta.story({
  args: { value: 0 },
})

export const Partial = meta.story({
  args: { value: 75 },
})

export const PartialEnglish = meta.story({
  args: { value: 75 },
  globals: { locale: "en" },
})

export const Complete = meta.story({
  args: { value: 100 },
})
