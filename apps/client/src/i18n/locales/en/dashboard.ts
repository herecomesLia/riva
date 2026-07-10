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
    continueTraining: "Continue training",
    startMockInterview: "Start mock interview",
    startPractice: "Start practice",
    viewHistory: "View training history",
  },
  activity: {
    eyebrow: "Recent training",
    title: "Keep improving from your latest practice",
    description: "Review key feedback and track the progress from every session.",
    items: {
      project: {
        title: "A project challenge and solution",
        description: "Yesterday · Targeted practice",
        score: "7.6 score",
      },
      behavioral: {
        title: "A collaboration with disagreement",
        description: "3 days ago · Behavioral interview",
        score: "7.1 score",
      },
      mockInterview: {
        title: "Technical first-round simulation",
        description: "Last week · Mock interview",
        score: "6.8 score",
      },
    },
  },
  currentRole: {
    eyebrow: "Current target",
    title: "Frontend Engineer",
    description: "ByteDance · Experienced hire · Technical role",
    status: "Profile and JD ready",
  },
  empty: {
    title: "Start with your job-search profile",
    description:
      "Add your resume and a target role for Riva to generate a match analysis and your first practice recommendation.",
    action: "Complete profile",
  },
  metrics: {
    eyebrow: "Preparation progress",
    roleFit: {
      title: "Role fit",
      value: "76%",
      description: "+4% from the last analysis",
    },
    training: {
      title: "This week's practice",
      value: "4 / 6 sessions",
      description: "2 sessions left to meet this week's goal",
    },
    performance: {
      title: "Average performance",
      value: "7.2 / 10",
      description: "+0.6 from last week",
    },
    weaknesses: {
      title: "Skills to improve",
      value: "3 areas",
      description: "Address frequent weak points first",
    },
  },
  nextSession: {
    eyebrow: "Next session",
    title: "Continue behavioral interview practice",
    description:
      "You completed 2 of 5 questions last time. Finish this session to receive a review.",
    meta: "About 12 minutes",
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
