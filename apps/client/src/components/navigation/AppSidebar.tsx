import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router"
import {
  BriefcaseBusinessIcon,
  ChevronsUpDownIcon,
  ClipboardListIcon,
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
import { useAuth } from "@/hooks/use-auth"

type AppNavigationPath =
  "/dashboard" | "/profile" | "/roles" | "/practice" | "/interview" | "/history"

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
    icon: ClipboardListIcon,
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
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()
  const { t } = useTranslation()

  if (!currentUser) {
    return null
  }

  const userName = currentUser.displayName
  const userDescription = currentUser.username
  const avatarUrl = currentUser.avatarUrl
  const avatarFallback = currentUser.avatarFallback

  async function handleSignOut() {
    await logout()
    void navigate({ to: "/login" })
  }

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
              <AvatarImage alt={userName} src={avatarUrl} />
              <AvatarFallback>{avatarFallback}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{userName}</span>
              <span className="truncate text-xs">{userDescription}</span>
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
                    <AvatarImage alt={userName} src={avatarUrl} />
                    <AvatarFallback>{avatarFallback}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{userName}</span>
                    <span className="truncate text-xs">{userDescription}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={handleSignOut} variant="destructive">
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
