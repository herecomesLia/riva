export const common = {
  close: "Close",
  trainingEntry: {
    available: {
      title: "Historical configuration is available",
      description: "The original role and training settings were restored without changes.",
    },
    adjusted: {
      title: "Some historical settings were adjusted",
      description:
        "The original role is still trainable, but the following settings are no longer available.",
      confirm: "Use adjusted settings",
      confirmed: "Adjusted settings confirmed. You can start when ready.",
    },
    adjustments: {
      practiceQuestionTypeUnsupported:
        "The original question type is unsupported; a supported type was selected.",
      interviewRoundUnsupported:
        "The original interview round is unsupported; a supported round was selected.",
      difficultyUnavailable:
        "The original difficulty is unavailable; an available difficulty was selected.",
      durationUnavailable:
        "The original duration is unavailable; an available duration was selected.",
    },
    roleUnavailable: {
      title: "The historical target role is unavailable",
      reasons: {
        targetRoleDeleted: "The original target role was deleted. Select another role to continue.",
        targetRoleArchived:
          "The original target role was archived. Select an active role to continue.",
        targetRolePrerequisiteUnavailable:
          "The original role no longer meets the training prerequisites. Select another eligible role to continue.",
      },
    },
    failed: {
      title: "Unable to prepare the historical configuration",
      description:
        "No old session or replacement configuration was used. Retry preparation to continue.",
      retry: "Retry preparation",
      retrying: "Retrying preparation",
    },
    selectRole: "Select a target role",
  },
  pageState: {
    empty: {
      title: "No content yet",
      description: "There is no content to show on this page yet.",
    },
    error: {
      title: "Page state error",
      description: "The page data could not be loaded.",
      retry: "Reload",
      retrying: "Reloading...",
    },
    loading: {
      title: "Loading",
      description: "Page data is being prepared.",
    },
  },
  sidebar: {
    description: "Displays the mobile sidebar.",
    title: "Sidebar",
    toggle: "Toggle sidebar",
    resize: "Resize sidebar",
  },
} as const
