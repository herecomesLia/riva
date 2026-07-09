import { createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router"
import { type ReactNode } from "react"

export type TestRouterOptions = {
  initialEntries?: string[]
}

export function createTestRouter(children: ReactNode, options: TestRouterOptions = {}) {
  const rootRoute = createRootRoute({
    component: () => <>{children}</>,
  })

  return createRouter({
    history: createMemoryHistory({
      initialEntries: options.initialEntries ?? ["/"],
    }),
    routeTree: rootRoute,
  })
}
