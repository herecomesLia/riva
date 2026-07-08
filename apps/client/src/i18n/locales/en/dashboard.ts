export const dashboard = {
  badge: "Dashboard",
  title: "Practice overview",
  description: "A lightweight placeholder for the main workspace route.",
  cards: {
    currentRole: {
      title: "Current role",
      description: "Frontend Engineer",
      badge: "Active",
    },
    nextSession: {
      title: "Next session",
      description: "Behavioral practice",
      badge: "Today",
    },
    recommendation: {
      title: "Recommendation",
      description: "Retry one weak answer",
      badge: "Suggested",
    },
  },
} as const
