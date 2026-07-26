import type { Decorator } from "@storybook/tanstack-react"
import { RouterProvider } from "@tanstack/react-router"
import { createContext, useContext, useState, type ReactNode } from "react"

import { createTestRouter } from "@/test/router"

type RouterStoryParameters = {
  initialEntries?: string[]
}

type RouterEnvironmentProps = {
  children: ReactNode
  initialEntries: string[]
}

const StoryContentContext = createContext<ReactNode>(null)

function StoryContent() {
  return <>{useContext(StoryContentContext)}</>
}

function resolveInitialEntries(value: unknown): string[] {
  if (typeof value !== "object" || value === null || !("initialEntries" in value)) {
    return ["/"]
  }

  const { initialEntries } = value as RouterStoryParameters

  if (
    !Array.isArray(initialEntries) ||
    initialEntries.length === 0 ||
    !initialEntries.every((entry) => typeof entry === "string")
  ) {
    return ["/"]
  }

  return initialEntries
}

function RouterEnvironment({ children, initialEntries }: RouterEnvironmentProps) {
  const [router] = useState(() =>
    createTestRouter(<StoryContent />, {
      initialEntries,
    }),
  )

  return (
    <StoryContentContext.Provider value={children}>
      <RouterProvider router={router} />
    </StoryContentContext.Provider>
  )
}

export const withRouter: Decorator = (Story, context) => {
  const initialEntries = resolveInitialEntries(context.parameters.router)

  const routerKey = `${context.id}:${JSON.stringify(initialEntries)}`

  return (
    <RouterEnvironment initialEntries={initialEntries} key={routerKey}>
      <Story />
    </RouterEnvironment>
  )
}
