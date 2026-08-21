export const roles = {
  title: "Target roles",
  description:
    "Manage roles you are preparing for or have archived, and review JD and match-analysis status.",
  actions: {
    add: "Add target role",
    archive: "Archive role",
    delete: "Delete role",
    edit: "Edit details",
    pause: "Pause preparation",
    resume: "Resume preparation",
    retry: "Reload",
    setCurrent: "Set as current role",
  },
  creationMethod: {
    title: "Choose how to create the role",
    description:
      "Continue with the existing manual form, or paste a JD for RIVA to identify before you confirm.",
    manual: {
      title: "Create manually",
      description: "Use the existing role creation flow.",
      detail: "Enter the role title, company, location, recruitment type, and preparation status.",
      action: "Create manually",
    },
    import: {
      title: "Identify with RIVA",
      description: "Identify key details from a job description.",
      detail: "Review the company, role title, location, and JD summary before a role is created.",
      action: "Identify with RIVA",
    },
    cancel: "Cancel",
  },
  import: {
    title: "Identify role with RIVA",
    description:
      "Paste the complete job description. RIVA prepares a role draft for review and will not create a target role automatically.",
    input: {
      label: "Job description text",
      placeholder:
        "Paste the role title, company, location, responsibilities, and requirements here…",
      required: "Paste the job description text.",
    },
    parsing: {
      title: "Parsing the JD",
      description: "RIVA is identifying the role title, company, location, and JD content.",
      preserve: "No target role will be created until you confirm.",
    },
    ready: {
      title: "JD parsing complete",
      description: "Review the identified details before creating the target role.",
      company: "Company",
      roleTitle: "Role title",
      location: "Location",
      summary: "JD summary",
    },
    failed: {
      title: "JD parsing failed",
      defaultReason: "RIVA could not identify role details from this JD.",
      requestDescription:
        "The JD parsing request could not be completed. Review the text and try again.",
      unexpectedState: "The role draft has an unexpected status. Enter the JD again.",
    },
    applyFailed: {
      title: "Role creation did not complete",
      description: "The identified result is still available. Confirm creation again in a moment.",
    },
    actions: {
      start: "Start identification",
      cancel: "Cancel",
      back: "Back to edit",
      reenter: "Enter JD again",
      apply: "Confirm and create role",
      applying: "Creating role",
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
      minYears: "Minimum years of experience",
      maxYears: "Maximum years of experience",
      preparationStatus: "Preparation status",
    },
    options: { unspecified: "Not specified" },
    validation: {
      required: "Enter a role title.",
      nonNegative: "Experience must be a non-negative integer.",
      experienceRange: "Minimum experience cannot exceed maximum experience.",
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
    versionConflict:
      "This role changed elsewhere. Close the form, review the latest version, and try again.",
  },
  jd: {
    cardDescription: "Paste the role JD and review its structured analysis.",
    actions: {
      add: "Paste job description",
      replace: "Edit or replace JD",
      editModule: "Edit",
      editModuleLabel: "Edit {{module}}",
      saveCorrection: "Save changes",
      savingCorrection: "Saving",
      startParsing: "Start parsing",
      retry: "Retry parsing",
      resynchronize: "Synchronize status",
    },
    editor: {
      addTitle: "Paste job description",
      replaceTitle: "Edit or replace job description",
      description: "The first version supports pasted text only. Saving starts structured parsing.",
      saveOnlyDescription:
        "Save the original job-description text. Structured parsing can be started after saving.",
      fieldLabel: "Job description text",
      placeholder: "Paste the full responsibilities, requirements, and preferred qualifications…",
      required: "Paste the job description text.",
      save: "Save and parse",
      saveOnly: "Save JD",
      saving: "Saving",
    },
    saved: {
      title: "JD saved",
      description:
        "The original JD is saved, but structured parsing has not started. Start parsing and finish it before generating match analysis.",
    },
    failed: {
      title: "JD parsing did not complete",
    },
    synchronization: {
      title: "Unable to retrieve the parsing result",
      description:
        "The JD is saved and remains in parsing. Synchronizing again will not create another parsing job.",
    },
    analysis: {
      rivaSummary: "RIVA Role Summary",
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
        other: "Other",
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
        "Edit each item or paste and organize a batch. This does not reparse the JD text.",
      qualificationsDescription:
        "Each item is one complete, independent qualification requirement. Preserve the original alternatives, conjunctions, and scope qualifiers; place preferred conditions under Preferred Qualifications.",
      preferredQualificationsDescription:
        "Each item is one complete preferred, bonus, or non-required condition. Preserve its alternatives and scope qualifiers.",
      bulletListDescription: "Each item is shown as a separate bullet point.",
      qualificationBulletListDescription:
        "Each item is one independent requirement. Preserve the original alternatives, conjunctions, and scope qualifiers.",
      bulletListEmpty: "No bullet points yet.",
      addRequirement: "Add requirement",
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
    cardDescription:
      "Compare the current job profile with this JD and focus your interview preparation.",
    actions: {
      generate: "Generate match analysis",
      regenerate: "Regenerate analysis",
      retry: "Retry generation",
      resynchronize: "Synchronize status",
    },
    prerequisites: {
      profile: {
        missing: {
          title: "Create your job profile first",
          description: "Match analysis uses your experience, skills, and job-search context.",
          action: "Create profile",
        },
        incomplete: {
          title: "Complete your job profile",
          description: "Add the key experience and skills needed for a reliable match analysis.",
          action: "Complete profile",
        },
      },
      jd: {
        missing: {
          title: "Add the job description first",
          description: "Save and parse the JD before comparing it with your profile.",
        },
        saved: {
          title: "JD saved but not parsed",
          description: "Start and finish structured JD parsing before generating match analysis.",
        },
        parsing: {
          title: "Waiting for JD parsing",
          description: "Match analysis will be available after JD parsing completes.",
        },
        failed: {
          title: "Retry JD parsing first",
          description: "A structured JD result is required before match analysis can start.",
        },
      },
    },
    synchronization: {
      title: "Unable to retrieve the match-analysis result",
      description:
        "The analysis task is still generating. Synchronizing again will not create another task.",
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
      matchedCapabilities: "Strong matches",
      missingCapabilities: "Missing capabilities",
      underrepresentedCapabilities: "Capabilities underrepresented in your profile",
      resumeHighlights: "Projects and experience to emphasize",
      resumeGaps: "Resume weaknesses",
      highRiskQuestions: "High-risk follow-up questions",
      preparationRecommendations: "Interview preparation recommendations",
    },
  },
  list: {
    title: "My roles",
    description: "Selecting a role shows its details without changing the current default role.",
    categoryLabel: "Role category",
    categories: {
      saved: "Saved ({{count}})",
      archived: "Archived ({{count}})",
    },
    empty: {
      saved: "No saved roles yet.",
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
    description: "Review role information, JD parsing, and match-analysis status.",
    fields: {
      company: "Company",
      recruitmentType: "Recruitment type",
      location: "Location",
      experience: "Experience",
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
  preparationStatus: {
    preparing: "Preparing",
    paused: "Paused",
    archived: "Archived",
  },
  recruitmentType: {
    campus: "Campus hire",
    experienced: "Experienced hire",
  },
  jobDescriptionStatus: {
    missing: {
      label: "Not added",
      description: "No job description has been saved yet.",
    },
    saved: {
      label: "Saved",
      description: "The original JD is saved and waiting for parsing.",
    },
    parsing: {
      label: "Parsing",
      description: "Extracting responsibilities, skills, and business requirements.",
    },
    ready: {
      label: "Parsed",
      description: "The JD has been parsed into structured requirements.",
    },
    failed: {
      label: "Parsing failed",
      description: "The original JD is preserved and parsing can be retried later.",
    },
  },
  matchingAnalysisStatus: {
    none: {
      label: "Not generated",
      description: "This role does not have a match analysis yet.",
    },
    generating: {
      label: "Generating",
      description: "Combining your job profile and JD into a match analysis.",
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
  experience: {
    range: "{{min}}–{{max}} years",
    minimum: "{{min}}+ years",
    maximum: "Up to {{max}} years",
    unspecified: "Not specified",
  },
  empty: {
    title: "No target roles yet",
    description: "Add your first target role to continue with JD parsing and match analysis.",
    action: "Add your first target role",
  },
  noSelection: {
    title: "Select a role",
    description: "Choose a saved role to review its details.",
  },
  noCurrentRole: "No current default role is set",
  fallbackValue: "Not specified",
} as const
