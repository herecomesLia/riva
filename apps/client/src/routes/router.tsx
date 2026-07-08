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
import { LoginPage } from "@/pages/LoginPage"

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

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  appRoute.addChildren([dashboardRoute]),
])

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />
}
