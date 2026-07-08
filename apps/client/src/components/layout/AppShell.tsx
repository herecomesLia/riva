import { Outlet } from "@tanstack/react-router"

import { SidebarNav } from "@/components/navigation/SidebarNav"
import { TopBar } from "@/components/navigation/TopBar"
import { Separator } from "@/components/ui/separator"

export function AppShell() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopBar />

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 md:grid-cols-[12rem_1fr]">
        <SidebarNav />
        <main className="min-w-0">
          <Separator className="mb-6 md:hidden" />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
