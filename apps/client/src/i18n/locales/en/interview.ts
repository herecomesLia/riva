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
  session: {
    badge: "Mock interview",
    title: "Interview in progress",
    progress: "Overall progress: {{completed}} / {{total}} main questions completed",
    questionPosition: "Question {{current}} of {{total}}",
    questionDescription:
      "Answer as you would in a real interview. The interviewer will continue after you submit.",
    promptKinds: {
      question: "Interviewer question",
      followUp: "Dynamic follow-up",
    },
    opening: {
      title: "Interview opening",
      description:
        "Start the continuous interview when ready. Per-question scores and sample answers stay hidden.",
    },
    answer: {
      title: "Your answer",
      description: "Use paragraphs as needed and explain the context, actions, and outcome.",
      label: "Answer",
      placeholder: "Type your answer here…",
      keyboardHint: "Press Ctrl + Enter (⌘ + Enter on Mac) to submit",
      submit: "Submit answer",
      submitting: "Submitting",
      requiredTitle: "Enter an answer first",
      requiredDescription: "The answer cannot be empty.",
      submittedTitle: "Your answer was submitted",
    },
    advance: {
      loading: "Your answer is saved. The interviewer is preparing the next question…",
      nextStage:
        "The main questions are complete. The candidate-question stage will be connected next.",
    },
    actions: {
      begin: "Start questions",
      beginning: "Starting questions",
      end: "End interview",
      confirmEnd: "End interview",
      continue: "Continue interview",
      retryAdvance: "Retry next question",
      continueToNext: "Continue to next question",
      backToSetup: "Back to interview setup",
    },
    endDialog: {
      title: "End this interview early?",
      description:
        "Submitted answers will be preserved. Unanswered content will not be included in this interview.",
    },
    errors: {
      loadTitle: "Unable to restore the interview",
      loadDescription: "The session could not be loaded. Retry or return to setup to start again.",
      beginTitle: "Unable to start the questions",
      beginDescription: "The interview session is still available, so you can retry.",
      submitTitle: "Unable to submit your answer",
      submitDescription: "Your answer is preserved. Check your connection and try again.",
      advanceTitle: "Unable to load the next question",
      advanceDescription:
        "Your answer was saved successfully, so you do not need to submit it again.",
      endTitle: "Unable to end the interview",
      endDescription: "The current session is still available. Please try again.",
    },
    unavailable: {
      missingTitle: "No valid interview session found",
      missingDescription:
        "This session may not have started, may have expired, or may not match this address.",
      unsupportedStageTitle: "This stage is not available in this step",
      unsupportedStageDescription:
        "Candidate questions and the final review will be connected in later steps.",
    },
  },
} as const
