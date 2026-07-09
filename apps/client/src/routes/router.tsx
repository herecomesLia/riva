import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"

import { AppShell } from "@/components/layout/AppShell"
import { DashboardPage } from "@/pages/DashboardPage"
import { HistoryPage } from "@/pages/HistoryPage"
import { InterviewPage } from "@/pages/InterviewPage"
import { LoginPage } from "@/pages/LoginPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { PracticePage } from "@/pages/PracticePage"
import { ProfilePage } from "@/pages/ProfilePage"
import { RolesPage } from "@/pages/RolesPage"

const rootRoute = createRootRoute({
  component: Outlet,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to="/dashboard" replace />,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppShell,
})

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard",
  component: DashboardPage,
})

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/profile",
  component: ProfilePage,
})

const rolesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/roles",
  component: RolesPage,
})

const practiceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/practice",
  component: PracticePage,
})

const interviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/interview",
  component: InterviewPage,
})

const historyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/history",
  component: HistoryPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  appRoute.addChildren([
    dashboardRoute,
    profileRoute,
    rolesRoute,
    practiceRoute,
    interviewRoute,
    historyRoute,
  ]),
])

const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundPage,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />
}
