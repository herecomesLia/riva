export const interview = {
  title: "Mock interview",
  description:
    "Practice a continuous, realistic interview and receive a full review with recommended next steps.",
  setup: {
    title: "Configure this interview",
    description:
      "Choose a target role, interview round, and difficulty so Riva can prepare your session.",
    fields: {
      targetRole: "Target role",
      round: "Interview round",
      difficulty: "Difficulty",
    },
  },
  rounds: {
    hr: "HR round",
    firstBusiness: "First business round",
    technical: "Technical round",
    manager: "Manager round",
    final: "Final round",
    comprehensive: "Comprehensive mock",
  },
  difficulty: {
    basic: "Basic",
    pressure: "High-pressure",
  },
  actions: {
    start: "Start mock interview",
    starting: "Preparing interview",
    addRole: "Add target role",
    retry: "Retry",
  },
  empty: {
    title: "No target roles available",
    description: "Add a target role before configuring a mock interview.",
  },
  errors: {
    loadTitle: "Unable to load interview setup",
    loadDescription: "The setup could not be loaded. Check your connection and try again.",
    startTitle: "Unable to start the interview",
    startDescription: "Your selections are preserved, so you can retry immediately.",
  },
  sessionPlaceholder: {
    badge: "Mock interview",
    title: "Your interview is ready",
    description: "The live interview experience will be connected in the next step.",
  },
} as const
