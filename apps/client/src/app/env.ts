export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api",
  mock: import.meta.env.MOCK === "true",
} as const
