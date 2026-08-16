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
      duration: "Expected duration",
    },
    durationMinutes: "{{minutes}} min",
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
  prerequisites: {
    profileIncomplete: {
      title: "Complete your job-search profile first",
      description:
        "Mock interviews use your real experience to generate questions. Complete your profile to continue.",
      action: "Complete profile",
    },
    jobDescriptionMissing: {
      title: "Add the target job description first",
      description:
        "Mock interviews use role responsibilities and capability requirements to generate a question set.",
      action: "Add job description",
    },
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
    progressUnknown:
      "{{completed}} main questions completed; the interviewer will adapt what comes next",
    planAdjusted: "Interview plan updated",
    questionPosition: "Question {{current}} of {{total}}",
    questionPositionUnknown: "Main question {{current}}",
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
    planning: {
      title: "Preparing the first main question",
      description:
        "The interviewer is using your profile and target role to prepare this interview. Please wait.",
      failedTitle: "The first main question could not be generated",
      failedDescription: "Your session is still available, so you can retry question generation.",
    },
    answer: {
      title: "Your answer",
      description: "Use paragraphs as needed and explain the context, actions, and outcome.",
      label: "Answer",
      placeholder: "Type your answer here…",
      keyboardHint: "Press Ctrl + Enter (⌘ + Enter on Mac) to submit",
      submit: "Submit answer",
      submitting: "Submitting and preparing the next question",
      requiredTitle: "Enter an answer first",
      requiredDescription: "The answer cannot be empty.",
      submittedTitle: "Your answer was submitted",
    },
    advance: {
      loading: "Your answer is saved. The interviewer is preparing the next question…",
    },
    history: {
      title: "Interview record",
      description:
        "{{count}} completed exchanges, with main questions and follow-ups clearly marked.",
      questionNumber: "Main question {{current}}",
      answer: "Your answer",
    },
    candidate: {
      badge: "Candidate questions",
      title: "Now it is your turn to ask",
      composerTitle: "Ask a question",
      composerDescription:
        "Continue asking questions, or finish the interview and generate the review.",
      label: "Candidate question",
      placeholder: "For example: What does success look like after six months in this role?",
      submit: "Submit question",
      submitting: "Getting an answer",
      requiredTitle: "Enter a question first",
      requiredDescription: "The candidate question cannot be empty.",
      exchangesTitle: "Candidate question record",
      exchangesDescription: "Review the interviewer responses and concise question feedback.",
      yourQuestion: "Your question {{current}}",
      interviewerAnswer: "Interviewer answer",
      feedback: "Quick feedback",
      betterQuestion: "A stronger way to ask",
      finish: "Finish interview",
      confirmFinish: "Finish and generate review",
      finishDialogTitle: "Finish candidate questions and complete the interview?",
      finishDialogDescription:
        "The full review will begin generating, and no more candidate questions can be added.",
    },
    actions: {
      begin: "Start questions",
      beginning: "Starting questions",
      end: "End interview",
      confirmEnd: "End and view review",
      continue: "Continue interview",
      retryAdvance: "Retry next question",
      continueToNext: "Continue to next question",
      backToSetup: "Back to interview setup",
      viewReview: "Go to interview review",
    },
    endDialog: {
      title: "End this interview early?",
      description:
        "Your current unsubmitted answer will not be saved. Questions already shown will still include Riva example answers in the review, which opens after the interview ends.",
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
      candidateSubmitTitle: "Unable to submit your question",
      candidateSubmitDescription:
        "Your question is preserved. Check your connection and try again.",
      finishTitle: "Unable to finish the interview",
      finishDescription: "Your candidate-question record is preserved. Please try again.",
    },
    unavailable: {
      missingTitle: "No valid interview session found",
      missingDescription:
        "This session may not have started, may have expired, or may not match this address.",
      completedTitle: "This interview is complete",
      completedDescription: "Go to the matching review page to check generation progress.",
    },
  },
  review: {
    badge: "Interview review",
    title: "Full interview review",
    description:
      "Turn your overall performance, key questions, and capability risks into a focused plan for the real interview.",
    loadingTitle: "Generating your interview review",
    loadingDescription:
      "Riva is organizing the answers actually saved in this session and the review data available.",
    errorTitle: "Unable to generate the review",
    errorDescription: "Your interview record is safe, so you can retry.",
    unavailable: {
      insufficientAnswers: {
        title: "Not enough answer data for a review",
        description:
          "No main questions were completed, so no scores or evaluations were generated. Start another mock interview when you are ready.",
      },
    },
    partialTitle: "This interview ended early",
    partialDescription:
      "These results use only the completed and saved answers. The limited data should be treated as directional.",
    partialOverallDescription:
      "Partial reviews do not include an overall score or complete dimension scores.",
    unavailableWithLearningDescription:
      "There is not enough answer data for scoring or performance feedback, but you can still study the Riva reference answers for questions that were actually shown.",
    emptyTitle: "No answers to review",
    emptyDescription:
      "No main questions were completed in this interview. Return to setup to start again.",
    scoreUnit: "Overall score",
    score: "{{score}} pts",
    dimensionDescription: "Every score and explanation comes from this interview review.",
    questionDescription:
      "Expand a question that was actually shown to review your answer, feedback, and layered reference answer.",
    mainQuestion: "Main question {{order}}",
    followUpQuestions: "Dynamic follow-ups",
    myAnswer: "My answer",
    answered: "Answered",
    unanswered: "Not answered",
    performance: "Performance feedback",
    questionStrengths: "Strengths",
    questionIssues: "Areas to improve",
    reference: {
      view: "View Riva example answer",
      structure: "Recommended structure",
      keyPoints: "Key points",
      example: "Riva example answer",
      generating: "Riva reference answer is being generated",
      unavailable: "Riva reference answer is unavailable",
    },
    sections: {
      overall: "Overall performance",
      dimensions: "Capability dimensions",
      questions: "Main question overview",
      strengths: "Key strengths",
      frequentIssues: "Recurring issues",
      weaknesses: "Exposed weaknesses",
      risks: "Interview risks",
      communication: "Communication improvements",
      preparation: "Preparation before the real interview",
      nextTraining: "Recommended next training",
    },
    dimensions: {
      relevance: "Relevance",
      structure: "Structure",
      specificity: "Specificity",
      personalContribution: "Personal contribution",
      resultsAndEvidence: "Results and evidence",
      roleAlignment: "Role alignment",
      communication: "Communication",
      riskControl: "Risk control",
    },
    actions: {
      retry: "Generate again",
      backToSetup: "Back to mock interview",
      restart: "Start another mock interview",
      startTargetedPractice: "Start targeted practice",
      startMockInterview: "Run another mock interview",
    },
  },
} as const
