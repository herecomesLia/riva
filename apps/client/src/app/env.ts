export const env = {
  mock: import.meta.env.VITE_USE_MOCK === "true",
} as const
