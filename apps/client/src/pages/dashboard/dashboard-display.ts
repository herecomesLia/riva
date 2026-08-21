export function formatDashboardScore(scoreOutOfOneHundred: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(scoreOutOfOneHundred)
}
