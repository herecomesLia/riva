export const appShell = {
  language: {
    label: "Language",
    options: {
      en: "English",
      zhCN: "简体中文",
    },
    select: "Select interface language",
  },
  theme: {
    label: "Theme",
    options: {
      dark: "Dark",
      light: "Light",
      system: "System",
    },
    select: "Select theme",
  },
  nav: {
    dashboard: "Dashboard",
    history: "Training history",
    interview: "Mock interview",
    practice: "Targeted practice",
    profile: "Job profile",
    roles: "Target roles",
  },
  appDescription: "Interview training assistant",
  preview: "Preview",
  openNavigation: "Open navigation",
  signOut: "Sign out",
  user: {
    avatar: "",
    description: "Candidate account",
    fallback: "DU",
    name: "Demo user",
  },
} as const
