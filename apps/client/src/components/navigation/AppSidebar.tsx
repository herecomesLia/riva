import { Link, useMatchRoute } from "@tanstack/react-router"
import {
  BriefcaseBusinessIcon,
  ChevronsUpDownIcon,
  DumbbellIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MessagesSquareIcon,
  TargetIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

type AppNavigationPath =
  | "/dashboard"
  | "/profile"
  | "/roles"
  | "/practice"
  | "/interview"
  | "/history"

type AppNavigationItem = {
  icon: LucideIcon
  labelKey: string
  to: AppNavigationPath
}

const appNavigationItems: AppNavigationItem[] = [
  {
    icon: LayoutDashboardIcon,
    labelKey: "appShell.nav.dashboard",
    to: "/dashboard",
  },
  {
    icon: UserRoundIcon,
    labelKey: "appShell.nav.profile",
    to: "/profile",
  },
  {
    icon: TargetIcon,
    labelKey: "appShell.nav.roles",
    to: "/roles",
  },
  {
    icon: DumbbellIcon,
    labelKey: "appShell.nav.practice",
    to: "/practice",
  },
  {
    icon: MessagesSquareIcon,
    labelKey: "appShell.nav.interview",
    to: "/interview",
  },
  {
    icon: HistoryIcon,
    labelKey: "appShell.nav.history",
    to: "/history",
  },
]

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AppSidebarHeader />
      </SidebarHeader>
      <SidebarContent>
        <NavigationList />
      </SidebarContent>
      <SidebarFooter>
        <AppSidebarUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function NavigationList() {
  const matchRoute = useMatchRoute()
  const { t } = useTranslation()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {appNavigationItems.map((item) => {
            const Icon = item.icon
            const isActive = Boolean(matchRoute({ to: item.to }))

            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  isActive={isActive}
                  render={<Link activeOptions={{ exact: true }} to={item.to} />}
                  tooltip={t(item.labelKey)}
                >
                  <Icon />
                  <span>{t(item.labelKey)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function AppSidebarHeader() {
  const { t } = useTranslation()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
          render={<Link to="/dashboard" />}
          size="lg"
          tooltip={t("app.name")}
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <BriefcaseBusinessIcon />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{t("app.name")}</span>
            <span className="truncate text-xs">{t("appShell.appDescription")}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function AppSidebarUser() {
  const { isMobile } = useSidebar()
  const { t } = useTranslation()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                size="lg"
              />
            }
          >
            <Avatar>
              <AvatarImage alt={t("appShell.user.name")} src={t("appShell.user.avatar")} />
              <AvatarFallback>{t("appShell.user.fallback")}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{t("appShell.user.name")}</span>
              <span className="truncate text-xs">{t("appShell.user.description")}</span>
            </div>
            <ChevronsUpDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-(--anchor-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage alt={t("appShell.user.name")} src={t("appShell.user.avatar")} />
                    <AvatarFallback>{t("appShell.user.fallback")}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{t("appShell.user.name")}</span>
                    <span className="truncate text-xs">{t("appShell.user.description")}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link to="/login" />} variant="destructive">
                <LogOutIcon />
                <span>{t("appShell.signOut")}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
