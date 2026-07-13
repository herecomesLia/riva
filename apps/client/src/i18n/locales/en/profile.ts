export const profile = {
  title: "Job profile",
  description:
    "This is your confirmed structured profile. Riva uses it for role matching and training recommendations.",
  updatedAt: "Last updated {{value}}",
  completeness: "Profile completeness",
  pendingReviewCount: "{{count}} items to review",
  matchingAnalysis: {
    current: "Matching analysis is current",
    stale: "Matching analysis is out of date",
    staleTitle: "Update your role matching analysis",
    staleDescription:
      "Your profile has changed, so the current analysis may no longer reflect your latest experience and direction.",
  },
  status: {
    draft: "Draft",
    uploadingResume: "Uploading resume",
    parsingResume: "Recognizing resume",
    recognitionFailed: "Recognition failed",
    awaitingConfirmation: "Waiting for confirmation",
    active: "Profile active",
  },
  processingStatus: {
    uploaded: "Uploaded, waiting to be recognized",
    parsing: "Recognizing",
    succeeded: "Recognition complete",
    failed: "Recognition failed",
  },
  actions: {
    edit: "Edit",
    replaceResume: "Replace resume",
    recognizeAgain: "Recognize again",
    viewTargetRoles: "View target roles",
  },
  resume: {
    title: "Current resume",
    description:
      "Your resume initializes the profile; you can maintain the profile independently afterwards.",
    typeAndSize: "{{type}} · {{size}}",
    uploadedAt: "Uploaded {{value}}",
    parsedAt: "Recognized {{value}}",
    pendingReview: "{{count}} items to review",
    noResume: "No resume uploaded yet",
    updatePendingTitle: "New resume is waiting for confirmation",
    updatePendingDescription:
      "The new resume has been recognized. Your active profile will not be replaced until it is confirmed.",
  },
  lifecycle: {
    uploading: {
      title: "Your resume is uploading",
      description:
        "Once it finishes uploading, we will recognize it and create a structured profile for review.",
    },
    parsing: {
      title: "Recognizing your resume",
      description:
        "Riva is extracting experience, skills, and job-search information from your resume.",
    },
    failed: {
      title: "Resume recognition failed",
      description: "We could not recognize this resume. Replace it or try recognition again later.",
    },
    awaitingConfirmation: {
      title: "Confirm the recognized information",
      description:
        "Some information needs your confirmation before it is used for role matching and training.",
    },
    needsReview: {
      title: "Your profile still has information to review",
      description: "Check the items marked for review in a later editing phase.",
    },
  },
  empty: {
    title: "You do not have a job profile yet",
    description:
      "After you upload a resume, Riva extracts initial information for review and creates a structured profile you can maintain over time.",
  },
  sections: {
    basicInformation: "Basic information",
    education: "Education",
    workExperience: "Work experience",
    projectExperience: "Project experience",
    skills: "Skills",
    credentials: "Certificates and awards",
    careerDirection: "Career direction",
    targetRoles: "Current target roles",
  },
  field: {
    name: "Name",
    professionalTitle: "Professional title",
    location: "Location",
    email: "Email",
    phone: "Phone",
    personalSummary: "Professional summary",
    portfolioUrl: "Portfolio",
    githubUrl: "GitHub",
    linkedinUrl: "LinkedIn",
    degreeMajor: "{{degree}} · {{major}}",
    dateRange: "{{start}} – {{end}}",
    present: "Present",
    responsibilities: "Responsibilities",
    contributions: "Contributions",
    achievements: "Achievements",
    technologies: "Technologies",
    skills: "Related skills",
    desiredTitles: "Desired roles",
    desiredLocations: "Desired locations",
    employmentTypes: "Employment types",
    summary: "Direction summary",
    issuer: "Issuer",
    awardedAt: "Awarded {{value}}",
  },
  reviewStatus: { confirmed: "Confirmed", needsReview: "Needs review", incomplete: "Incomplete" },
  employmentType: {
    fullTime: "Full time",
    partTime: "Part time",
    internship: "Internship",
    contract: "Contract",
    freelance: "Freelance",
  },
  credentialType: { certificate: "Certificate", award: "Award" },
  helper: {
    title: "How Riva uses this information",
    description:
      "Confirmed experience, skills, and career direction are used for role matching, training question generation, and feedback focus. Unconfirmed or missing information is not treated as complete evidence.",
    pendingTitle: "Items to address",
    pendingDescription:
      "Confirm these items to make analysis and training recommendations more relevant.",
    missing: "To complete: {{sections}}",
    needsReview: "To review: {{sections}}",
    allClear: "There are no items to address right now.",
  },
  emptySection: "This section has not been filled in yet.",
} as const
