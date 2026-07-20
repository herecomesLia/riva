export const practice = {
  title: "Targeted practice",
  description: "Focus on one question, get immediate feedback, and improve your answer quickly.",
  setup: {
    title: "Practice setup",
    description:
      "Choose a target role and question direction. Riva will generate one focused question.",
    fields: {
      targetRole: "Target role",
      questionType: "Question type",
      difficulty: "Difficulty",
      source: "Question source",
      prioritizeWeaknesses: "Prioritize weak areas",
    },
    weaknessDescription: "Use recent performance to focus on an area that needs improvement.",
  },
  questionTypes: {
    projectDeepDive: "Project deep dive",
    behavioral: "Behavioral",
    businessUnderstanding: "Business understanding",
    motivation: "Motivation",
    technicalFoundation: "Technical foundations",
  },
  difficulty: {
    basic: "Basic",
    pressure: "Pressure",
  },
  sources: {
    personalized: "Personalized",
    saved: "Saved questions",
    history: "Practice history",
  },
  actions: {
    start: "Start practice",
    starting: "Starting",
    retryGeneration: "Generate again",
    retryingGeneration: "Generating again",
    usePersonalized: "Switch to personalized",
    manageRoles: "Go to target roles",
  },
  availability: {
    saved: {
      title: "No eligible saved questions",
      description:
        "There are no saved questions for this role and question type. Switch to personalized questions to continue.",
    },
    history: {
      title: "No eligible history questions",
      description:
        "There are no previous questions for this role and question type. Switch to personalized questions to continue.",
    },
  },
  noRoles: {
    title: "Add a target role first",
    description:
      "Targeted practice needs a role for question context. Add one to start single-question training.",
  },
  loading: {
    cardDescription: "Loading target roles and available question sources.",
  },
  errors: {
    startTitle: "Unable to start practice",
    startDescription: "Your setup is preserved. Please try again in a moment.",
    generationTitle: "Question generation did not complete",
    generationDescription:
      "Your setup is preserved. Generate again without resubmitting the previous task.",
  },
  generation: {
    title: "Generating your question",
    description:
      "Riva is preparing one focused question from your target role, question type, and difficulty.",
    progress: "This usually takes only a moment. Keep this page open.",
  },
  ready: {
    title: "Your question is ready",
    description: "The answer workspace will be implemented in the next targeted-practice step.",
  },
  summary: {
    targetRole: "Target role",
    questionType: "Question type",
    difficulty: "Difficulty",
    source: "Question source",
  },
} as const
