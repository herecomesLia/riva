import { Outlet } from "@tanstack/react-router"

import { AppSidebar } from "@/components/navigation/AppSidebar"
import { AppTopbar } from "@/components/navigation/AppTopbar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useLayoutStore } from "@/stores/layout"

export function AppShell() {
  const isMobileNavigationOpen = useLayoutStore((state) => state.isMobileNavigationOpen)
  const isSidebarOpen = useLayoutStore((state) => state.isSidebarOpen)
  const setMobileNavigationOpen = useLayoutStore((state) => state.setMobileNavigationOpen)
  const setSidebarOpen = useLayoutStore((state) => state.setSidebarOpen)

  return (
    <SidebarProvider
      onOpenChange={setSidebarOpen}
      onOpenMobileChange={setMobileNavigationOpen}
      open={isSidebarOpen}
      openMobile={isMobileNavigationOpen}
    >
      <AppSidebar />
      <SidebarInset>
        <AppTopbar />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
