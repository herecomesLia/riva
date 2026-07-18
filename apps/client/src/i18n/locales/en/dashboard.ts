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
    experienceYears: {
      range: "{{min}}–{{max}} years",
      minimum: "{{min}}+ years",
      maximum: "Up to {{max}} years",
    },
    recruitmentTypes: {
      campus: "Campus hire",
      experienced: "Experienced hire",
    },
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
  empty: {
    title: "Start with your job-search profile",
    description:
      "Add your resume and a target role for Riva to generate a match analysis and your first practice recommendation.",
    action: "Complete profile",
  },
  metrics: {
    eyebrow: "Preparation progress",
    noData: "No data",
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
    empty: "No {{type}} records yet.",
  },
  recommendation: {
    eyebrow: "Today's recommendation",
    duration: "About {{minutes}} min",
    questionTypes: {
      projectExperience: "Project experience",
    },
    empty: {
      title: "No recommendation yet",
      description: "Complete more training to receive your next recommendation.",
    },
  },
  weaknesses: {
    eyebrow: "Improve first",
    title: "Turn weak areas into your next strengths",
    description: "Prioritized from recent practice feedback.",
    categories: {
      projectExpression: "Project storytelling",
      quantifiedResults: "Measurable results",
      pressureResponse: "Pressure scenarios",
    },
    empty: "No priority weak areas found yet.",
    recommendedPracticeCount: "Practice {{count}} questions",
  },
} as const
