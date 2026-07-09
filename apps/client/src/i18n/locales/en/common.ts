export const common = {
  close: "Close",
  pageState: {
    empty: {
      title: "No content yet",
      description: "There is no content to show on this page yet.",
    },
    error: {
      title: "Page state error",
      description: "The current simulated scenario returned an error state.",
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
  },
} as const
