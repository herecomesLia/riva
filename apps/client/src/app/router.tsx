import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"

import { AppShell } from "@/components/layout/AppShell"
import { useAuth } from "@/hooks/use-auth"
import { DashboardPage } from "@/pages/dashboard"
import { HistoryPage } from "@/pages/history"
import { InterviewPage } from "@/pages/interview"
import { LoginPage } from "@/pages/login"
import { NotFoundPage } from "@/pages/not-found"
import { PracticePage } from "@/pages/practice"
import { ProfilePage } from "@/pages/profile"
import { RolesPage } from "@/pages/roles"

function IndexRoute() {
  const { isAuthenticated } = useAuth()

  return <Navigate replace to={isAuthenticated ? "/dashboard" : "/login"} />
}

function LoginRoute() {
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) {
    return <Navigate replace to="/dashboard" />
  }

  return <LoginPage />
}

function RegisterRoute() {
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) {
    return <Navigate replace to="/dashboard" />
  }

  return <LoginPage mode="register" />
}

function AppRoute() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />
  }

  return <AppShell />
}

const rootRoute = createRootRoute({
  component: Outlet,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexRoute,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginRoute,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: RegisterRoute,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppRoute,
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
  registerRoute,
  appRoute.addChildren([
    dashboardRoute,
    profileRoute,
    rolesRoute,
    practiceRoute,
    interviewRoute,
    historyRoute,
  ]),
])

function createAppRouter() {
  return createRouter({
    routeTree,
    defaultNotFoundComponent: NotFoundPage,
  })
}

const router = createAppRouter()

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />
}
