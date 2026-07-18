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
  list: {
    title: "Saved roles",
    description: "Selecting a role shows its details without changing the current default role.",
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
