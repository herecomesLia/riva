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
      retry: "Retry parsing",
      resynchronize: "Synchronize status",
    },
    editor: {
      addTitle: "Paste job description",
      replaceTitle: "Edit or replace job description",
      description: "The first version supports pasted text only. Saving starts structured parsing.",
      fieldLabel: "Job description text",
      placeholder: "Paste the full responsibilities, requirements, and preferred qualifications…",
      required: "Paste the job description text.",
      save: "Save and parse",
      saving: "Saving",
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
      summary: "Core requirements",
      responsibilities: "Responsibilities",
      requiredSkills: "Required skills",
      preferredSkills: "Preferred skills",
      experienceRequirements: "Experience requirements",
      softSkills: "Soft skills",
      businessDomains: "Business domains",
      keywords: "Frequent keywords",
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
  },
  noSelection: {
    title: "Select a role",
    description: "Choose a saved role to review its details.",
  },
  noCurrentRole: "No current default role is set",
  fallbackValue: "Not specified",
} as const
