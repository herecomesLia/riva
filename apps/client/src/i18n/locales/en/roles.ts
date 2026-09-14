export const roles = {
  title: "Target roles",
  description: "Manage active and archived roles, and review JD and match-analysis status.",
  actions: {
    add: "Add target role",
    archive: "Archive role",
    delete: "Delete role",
    edit: "Edit details",
    retry: "Reload",
    restore: "Restore role",
    setCurrent: "Set as current role",
  },
  creation: {
    title: "Add target role",
    description:
      "Choose an entry method. For text, images, or a link, Riva recognizes and creates the target role.",
    methodsLabel: "Target role entry method",
    methods: {
      manual: "Enter manually",
      text: "Paste text",
      image: "Upload images",
      url: "Job link",
    },
    methodDescriptions: {
      manual: "Enter the role, company, and location. You can add the JD later.",
      text: "Paste the full posting so Riva can recognize the role basics and JD.",
      image: "Upload one or more screenshots for the vision agent to understand directly.",
      url: "Provide a public job page for Riva to retrieve and recognize.",
    },
    methodTitles: {
      manual: "Enter target role manually",
      text: "Paste job posting text",
      image: "Upload job posting images",
      url: "Add a job posting link",
    },
    methodDialogDescription:
      "Riva creates the target role after recognition. You can correct the result from the role page.",
    backToMethods: "Back to entry methods",
    changeMethod: {
      title: "Change entry method?",
      description: "Going back clears the unsaved content in the current method.",
      stay: "Keep entering",
      confirm: "Clear and go back",
    },
    recognize: "Recognize with Riva",
    recognizing: "Riva is recognizing",
    recognitionFailed:
      "Riva could not recognize this job posting. Your input is preserved; review it and try again.",
    text: {
      label: "Job posting text",
      description:
        "Paste the full role overview, responsibilities, and requirements. Riva recognizes the role basics and JD.",
      placeholder: "Paste the complete job posting here…",
      required: "Paste the job posting text.",
    },
    image: {
      label: "Job posting images",
      description:
        "Upload screenshots of the job posting. Riva sends the original images directly to a vision agent without OCR; add multiple screenshots in page order for long postings.",
      required: "Upload at least one job posting image.",
      selectedImages: "Selected job posting images",
      order: "Image {{count}}",
      remove: "Remove {{name}}",
    },
    url: {
      label: "Job posting URL",
      description:
        "Paste a publicly accessible job page and Riva will retrieve and recognize its role details.",
      placeholder: "https://example.com/jobs/role",
      invalid: "Enter a valid HTTP or HTTPS job posting URL.",
    },
  },
  editor: {
    create: {
      title: "Add target role",
      description: "Save the role basics. Your first role becomes the current role automatically.",
    },
    edit: {
      title: "Edit role details",
      description: "Update role basics without implicitly changing the current role.",
    },
    fields: {
      title: "Role title",
      company: "Company name",
      recruitmentType: "Recruitment type",
      location: "Location",
    },
    options: { unspecified: "Not specified" },
    validation: {
      required: "Enter a role title.",
    },
    cancel: "Cancel",
    save: "Save",
    saving: "Saving",
  },
  dialog: {
    archiveTitle: "Archive this role?",
    archiveDescription: "The role will remain saved, but an archived role cannot be current.",
    deleteTitle: "Permanently delete this role?",
    deleteDescription:
      "This cannot be undone. The role, JD, and match-analysis data will be deleted.",
    cancel: "Cancel",
    discardDraftTitle: "Discard unsaved changes?",
    discardDraftDescription: "Closing will discard the role details you have not saved.",
    stayEditing: "Keep editing",
    discardChanges: "Discard changes",
    leavePageTitle: "Leave and discard changes?",
    leavePageDescription: "The role form still contains unsaved changes.",
    leavePage: "Leave page",
  },
  errors: {
    actionTitle: "Action not completed",
    requestFailed:
      "We could not save this change. Try again later; your draft and current role data are preserved.",
    stateConflict:
      "The current role or task state does not allow this action. Review the latest state and try again.",
  },
  jd: {
    aborting: "Cancelling JD extraction…",
    cardDescription: "Paste the role JD and review its structured analysis.",
    actions: {
      retryExtraction: "Retry extraction",
      abortExtraction: "Cancel extraction",
      add: "Paste job description",
      replace: "Update JD",
      editModule: "Edit",
      editModuleLabel: "Edit {{module}}",
      saveCorrection: "Save changes",
      savingCorrection: "Saving",
      resynchronize: "Synchronize status",
    },
    editor: {
      addTitle: "Paste job description",
      replaceTitle: "Update JD",
      description: "Submitting reparses it and replaces the current structured result.",
      fieldLabel: "Job description text",
      placeholder: "Paste the full responsibilities, requirements, and preferred qualifications…",
      required: "Paste the job description text.",
      save: "Submit and extract",
      saving: "Saving",
    },
    failed: {
      title: "JD extraction did not complete",
    },
    synchronization: {
      title: "Unable to retrieve the extracting result",
      description:
        "The extraction state or latest JD could not be retrieved. Synchronizing again will not create another extraction task.",
    },
    emptyHints: {
      responsibilities: "Describe the role’s responsibilities and expected outcomes.",
      requirements: "Add education, field of study, work experience, and other requirements.",
      hardSkills: "List the required technologies, tools, and methods.",
      preferredQualifications: "Add experience or skills that are helpful but not required.",
      softSkills:
        "Describe requirements such as communication, collaboration, and problem analysis.",
      businessDomains: "Specify the industries, business contexts, or product areas involved.",
    },
    analysis: {
      responsibilities: "Responsibilities",
      requiredSkills: "Required Skills",
      qualificationRequirements: "Qualifications",
      preferredQualifications: "Preferred Qualifications",
      softSkills: "Soft Skills",
      businessDomains: "Business Domains",
      qualificationCategories: {
        education: "Education",
        graduationCohorts: "Graduation Cohort",
        majors: "Majors",
        experience: "Experience",
        languages: "Languages",
        certifications: "Certifications",
      },
      skillCategories: {
        programmingLanguages: "Programming Languages",
        frameworksAndLibraries: "Frameworks & Libraries",
        platforms: "Platforms",
        tools: "Tools",
        conceptsAndMethods: "Concepts & Methods",
        databasesAndMiddleware: "Databases & Middleware",
        other: "Other",
      },
    },
    analysisEditor: {
      listDescription:
        "Edit each item or paste and organize a batch. This does not run JD extraction again.",
      qualificationsDescription:
        "Edit each item. Qualifications must be required conditions; place preferred conditions under Preferred Qualifications.",
      preferredQualificationsDescription:
        "Edit each preferred, bonus, or non-required condition separately.",
      bulletListDescription: "Each item is shown as a separate bullet point.",
      bulletListEmpty: "No bullet points yet.",
      addBullet: "Add item",
      deleteBullet: "Delete item {{count}}",
      pasteAndOrganize: "Paste and organize",
      pasteContent: "Paste content",
      pasteContentDescription:
        "Content is organized only by explicit lists, semicolons, or sentence endings.",
      previewBullets: "Preview organized result",
      organizedResult: "Organized result",
      organizedResultDescription: "You can return to edit the pasted content before applying it.",
      ambiguousBulletPaste: "No explicit separator was found, so this content is kept as one item.",
      replaceBullets: "Replace existing items",
      appendBullets: "Append to existing items",
      backToEdit: "Back to edit",
      applyBullets: "Use these items",
    },
  },
  matching: {
    failureCodes: {
      invalid_output: "The analysis output was invalid. Please try again.",
      llm_unavailable: "The AI service is unavailable. Please try again later.",
      service_unavailable: "The service is temporarily unavailable. Please try again later.",
      internal_error: "The analysis failed. Please try again.",
    },
    cardDescription:
      "Compare the current job profile with this JD and focus your interview preparation.",
    actions: {
      abort: "Cancel analysis",
      generate: "Generate match analysis",
      regenerate: "Regenerate analysis",
      retry: "Retry generation",
      resynchronize: "Synchronize status",
    },
    synchronization: {
      title: "Unable to retrieve analysis status",
      description:
        "The task status could not be confirmed. Try synchronizing again; this will not start a new analysis.",
    },
    stale: {
      title: "This result needs an update",
      description:
        "Your profile or JD changed. The previous generated analysis remains visible below.",
    },
    failed: {
      title: "Match analysis did not complete",
    },
    result: {
      overallMatch: "Overall match",
      coreRequirements: "Core role requirements",
      resumeStrengths: "Resume strengths",
      resumeGaps: "Resume gaps",
      resumeOptimizationSuggestions: "Resume optimization suggestions",
      interviewPreparationSuggestions: "Interview preparation suggestions",
    },
  },
  list: {
    title: "My roles",
    description: "Selecting a role shows its details without changing the current default role.",
    categoryLabel: "Role category",
    categories: {
      active: "Active ({{count}})",
      archived: "Archived ({{count}})",
    },
    empty: {
      active: "No active roles yet.",
      archived: "No archived roles yet.",
    },
    matchScore: "Match score {{score}}%",
  },
  mobileSelector: {
    label: "Select a role to view",
  },
  tabs: {
    label: "Role content",
    overview: "Overview",
    jobDescription: "Job description",
    matchingAnalysis: "Match analysis",
  },
  summary: {
    title: "Role progress",
    roleStatus: "Role status",
    profile: "Job profile",
    jobDescription: "Job description",
    matchingAnalysis: "Match analysis",
    updatedAt: "Last updated",
    profileStatus: {
      missing: "Not created",
      incomplete: "Incomplete",
      complete: "Complete",
    },
  },
  details: {
    title: "Role details",
    description: "Review role information, JD extraction, and match-analysis status.",
    fields: {
      company: "Company",
      recruitmentType: "Recruitment type",
      location: "Location",
    },
    sections: {
      basics: "Role information",
      jobDescription: "Job description",
      matchingAnalysis: "Match analysis",
    },
  },
  badges: {
    current: "Current role",
    selected: "Viewing",
  },
  status: {
    active: "Active",
    archived: "Archived",
  },
  recruitmentType: {
    campus: "Campus hire",
    experienced: "Experienced hire",
  },
  jobDescriptionStatus: {
    loading: { label: "Loading" },
    missing: {
      label: "Not added",
      description: "No job description has been saved yet.",
    },
    extracting: {
      label: "Extracting",
      description: "Extracting responsibilities, skills, and business requirements.",
    },
    ready: {
      label: "Extracted",
      description: "The JD has been extracted into structured requirements.",
    },
    failed: {
      label: "Extraction failed",
      description: "Retry extraction or submit a new JD.",
    },
  },
  matchingAnalysisStatus: {
    queued: { label: "Queued" },
    running: { label: "Analyzing" },
    aborting: { label: "Cancelling" },
    loading: { label: "Loading" },
    none: {
      label: "Not generated",
      description: "This role does not have a match analysis yet.",
    },
    current: {
      label: "Current",
      description: "The analysis uses the current profile and JD.",
    },
    stale: {
      label: "Update needed",
      description: "Your profile or JD changed; this is the previous analysis result.",
    },
    failed: {
      label: "Generation failed",
      description: "No analysis was generated; your role and JD data are unchanged.",
    },
  },
  empty: {
    title: "No target roles yet",
    description: "Add your first target role to continue with JD extraction and match analysis.",
  },
  noSelection: {
    title: "Select a role",
    description: "Choose a saved role to review its details.",
  },
  noCurrentRole: "No current default role is set",
  fallbackValue: "Not specified",
} as const
