import { Outlet } from "@tanstack/react-router"

import { AppSidebar } from "@/components/navigation/AppSidebar"
import { AppTopbar } from "@/components/navigation/AppTopbar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AppShell() {
  return (
    <SidebarProvider>
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
