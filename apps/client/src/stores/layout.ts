import { create } from "zustand"

type LayoutState = {
  isMobileNavigationOpen: boolean
  isSidebarOpen: boolean
  setMobileNavigationOpen: (open: boolean) => void
  setSidebarOpen: (open: boolean) => void
  toggleMobileNavigation: () => void
  toggleSidebar: () => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  isMobileNavigationOpen: false,
  isSidebarOpen: true,
  setMobileNavigationOpen: (open) => {
    set({ isMobileNavigationOpen: open })
  },
  setSidebarOpen: (open) => {
    set({ isSidebarOpen: open })
  },
  toggleMobileNavigation: () => {
    set((state) => ({ isMobileNavigationOpen: !state.isMobileNavigationOpen }))
  },
  toggleSidebar: () => {
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }))
  },
}))
