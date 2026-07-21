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
    submitTitle: "Answer submission failed",
    submitDescription: "Your answer is still in the editor. Please try again.",
    hintTitle: "Hint unavailable",
    hintDescription: "Try again in a moment. Your answer is unaffected.",
    frameworkTitle: "Answer framework unavailable",
    frameworkDescription: "Try again in a moment. Your answer is unaffected.",
    actionTitle: "Action not completed",
    savedDescription: "The saved state did not change. Please try again.",
    weakDescription: "The weak-question state did not change. Please try again.",
    skipDescription: "The question was not skipped. Please try again.",
    endDescription: "Your practice session is still active. Please try again.",
    followUpSubmitTitle: "Follow-up answer not submitted",
    followUpSubmitDescription: "Your follow-up draft is still here. Please try again.",
    endFollowUpDescription: "The follow-up is still active. Please try again.",
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
  session: {
    eyebrow: "Current targeted practice",
    unknownRole: "Target role",
  },
  question: {
    capabilities: "Assessed capabilities",
    recommendedMaterials: "Recommended projects or experiences",
    saved: "Saved",
    weak: "Weak question",
  },
  answer: {
    title: "Build your answer",
    description: "Complete your main answer first. Your draft stays here if submission fails.",
    label: "Main answer",
    placeholder: "Write your answer with a concrete situation, your actions, and results…",
    characterCount: "{{count}} characters",
    submit: "Submit answer",
    submitting: "Submitting",
  },
  followUp: {
    timelineTitle: "Question conversation",
    timelineDescription: "Submitted answers are read-only. The current follow-up is highlighted.",
    mainQuestion: "Riva · Main question",
    yourMainAnswer: "Your main answer",
    followUpNumber: "Riva · Follow-up {{count}}",
    yourFollowUpAnswer: "Your follow-up answer {{count}}",
    currentFollowUp: "Riva · Current follow-up {{count}}",
    unansweredFollowUp: "Riva · Unanswered follow-up {{count}}",
    composerTitle: "Answer the current follow-up",
    composerDescription:
      "Add the key details, then Riva will decide whether another follow-up is needed.",
    answerLabel: "Current follow-up answer",
    answerPlaceholder: "Add your specific reasoning, actions, or evidence for this follow-up…",
    submit: "Submit follow-up answer",
    submitting: "Submitting follow-up answer",
    processing: "Riva is reviewing your answer and preparing the next step…",
    processingDescription: "Your answer was sent. Riva is deciding whether to follow up again.",
    endAnswering: "End this question",
    endDialogTitle: "End the current follow-up?",
    endDialogDescription:
      "The current follow-up will be recorded as incomplete, then scoring will begin.",
    confirmEnd: "End and start scoring",
    ending: "Ending",
    endedEarly:
      "You ended the follow-up early. The unanswered follow-up was recorded as incomplete.",
  },
  guidance: {
    title: "Answer guidance",
    hintTitle: "Answer hint",
    hintDescription: "Consider what information matters without revealing an answer.",
    requestHint: "Request hint",
    hintUnavailable: "No hint is available for this question.",
    frameworkTitle: "Answer framework",
    frameworkDescription: "Organize your answer without replacing your real experience.",
    requestFramework: "Request answer framework",
    frameworkUnavailable: "No answer framework is available for this question.",
  },
  questionActions: {
    title: "Question actions",
    save: "Save question",
    unsave: "Remove from saved",
    markWeak: "Mark as weak",
    unmarkWeak: "Remove weak mark",
    skip: "Skip question",
    end: "End practice session",
  },
  dialog: {
    cancel: "Keep answering",
    skipTitle: "Skip this question?",
    skipDescription:
      "Your unsubmitted answer will not be saved. Riva will start generating another question.",
    confirmSkip: "Skip question",
    endTitle: "End this targeted-practice session?",
    endDescription: "Your unsubmitted answer will not be saved, and this session will end.",
    confirmEnd: "End practice",
    leaveTitle: "Leave and discard your answer?",
    leaveDescription: "This answer has not been submitted. Leaving will discard the draft.",
    leaveFollowUpTitle: "Leave and discard the follow-up answer?",
    leaveFollowUpDescription:
      "This follow-up answer has not been submitted. Leaving will discard the draft.",
    stay: "Keep answering",
    leave: "Leave page",
  },
  evaluating: {
    title: "Processing your answer",
    description:
      "This question is complete. Riva is preparing the score, which will be shown in the next step.",
  },
  completed: {
    title: "This targeted-practice session has ended",
    description: "A complete session summary will be added in a later step.",
  },
  summary: {
    targetRole: "Target role",
    questionType: "Question type",
    difficulty: "Difficulty",
    source: "Question source",
  },
} as const
