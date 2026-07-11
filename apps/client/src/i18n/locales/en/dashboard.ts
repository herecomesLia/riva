export const dashboard = {
  badge: "Dashboard",
  title: "Dashboard",
  greeting: {
    prefix: "Good to see you, ",
    suffix: "! Let’s make today count.",
  },
  actions: {
    adjustRole: "Adjust role",
    analyzeRole: "View match analysis",
    startMockInterview: "Start mock interview",
    startPractice: "Start practice",
    viewHistory: "View training history",
  },
  currentRole: {
    eyebrow: "Current target",
    title: "Frontend Engineer",
    context: "ByteDance · Experienced hire · Technical role",
    metadata: "Shanghai · 3–5 years experience",
    actions: {
      adjust: "Adjust role",
      analyze: "View match analysis",
      addJobDescription: "Add job description",
      completeProfile: "Complete profile",
    },
    status: {
      profile: {
        complete: "Profile complete",
        incomplete: "Complete profile",
      },
      jobDescription: {
        complete: "JD added",
        incomplete: "Add JD",
      },
    },
    empty: {
      title: "No target role yet",
      description: "Add a target role to unlock match analysis and personalized training guidance.",
      action: "Add target role",
    },
  },
  developmentPreview: {
    title: "Development preview · Current target",
    complete: "Complete",
    missingJobDescription: "Missing job description",
    missingProfile: "Missing profile",
    empty: "Empty state",
  },
  empty: {
    title: "Start with your job-search profile",
    description:
      "Add your resume and a target role for Riva to generate a match analysis and your first practice recommendation.",
    action: "Complete profile",
  },
  metrics: {
    eyebrow: "Preparation progress",
    noComparison: "No comparable data",
    roleFit: {
      title: "Role fit",
      comparison: "vs. {{value}} last role analysis",
    },
    practiceTime: {
      title: "Today's practice time",
      comparison: "vs. {{value}} yesterday",
    },
    targetedPractice: {
      title: "Targeted practice performance",
      comparison: "vs. {{value}} previous targeted practice",
    },
    mockInterview: {
      title: "Mock interview score",
      comparison: "vs. {{value}} previous mock interview",
    },
    values: {
      percentage: "{{value}}%",
      duration: "{{value}} min",
      durationUnit: "min",
      score: "{{value}} / 10",
    },
  },
  performanceTrend: {
    title: "Performance trend",
    description: "Your 10 most recent {{type}} scores.",
    switchLabel: "Performance type",
    types: {
      targetedPractice: "Targeted practice",
      mockInterview: "Mock interview",
    },
    trainingDays: "Training days",
    daysUnit: "days",
    highestScore: "Highest score",
    averageScore: "Average score",
    score: "{{score}} / 10",
    session: "{{type}} · Session {{count}}",
    chartLabel: "10 most recent {{type}} scores",
  },
  readiness: {
    eyebrow: "Role readiness",
    title: "You are in the targeted practice stage",
    description:
      "Complete your weak-area practice before testing your overall performance in a mock interview.",
    completed: "Completed",
    current: "In progress",
    upcoming: "Next step",
    stages: {
      profile: "Build profile",
      role: "Analyze role",
      practice: "Targeted practice",
      interview: "Mock interview",
    },
  },
  recommendation: {
    eyebrow: "Today's recommendation",
    title: "Retry: A project challenge and solution",
    description:
      "Your recent answer explained the context clearly, but the trade-offs and measurable results can be more specific.",
    type: "Project experience",
    duration: "About 8 minutes",
  },
  weaknesses: {
    eyebrow: "Improve first",
    title: "Turn weak areas into your next strengths",
    description: "Prioritized from recent practice feedback.",
    items: {
      projectExpression: {
        title: "Project storytelling",
        description: "Make the structure and key trade-offs clearer.",
        count: "Practice 2 questions",
      },
      quantifiedResults: {
        title: "Measurable results",
        description: "Add verifiable business impact and personal contribution.",
        count: "Practice 2 questions",
      },
      pressureResponse: {
        title: "Pressure scenarios",
        description: "Explain your actions, collaboration, and reflection more completely.",
        count: "Practice 1 question",
      },
    },
  },
} as const
