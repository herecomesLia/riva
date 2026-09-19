export const practiceQueryKeys = {
  all: ["practices"] as const,
  active: () => ["practices", "active"] as const,
  details: () => ["practices", "detail"] as const,
  detail: (practiceId: string) => ["practices", "detail", practiceId] as const,
  round: (practiceId: string, roundId: string) =>
    ["practices", "detail", practiceId, "round", roundId] as const,
  task: (practiceId: string, roundId: string) =>
    ["practices", "detail", practiceId, "round", roundId, "task"] as const,
}
