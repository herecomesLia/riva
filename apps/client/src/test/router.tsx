import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import { type ReactNode } from "react"

export type TestRouterOptions = {
  initialEntries?: string[]
}

export function createTestRouter(children: ReactNode, options: TestRouterOptions = {}) {
  const rootRoute = createRootRoute()
  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$",
    component: () => <>{children}</>,
  })

  return createRouter({
    history: createMemoryHistory({
      initialEntries: options.initialEntries ?? ["/"],
    }),
    routeTree: rootRoute.addChildren([testRoute]),
  })
}
