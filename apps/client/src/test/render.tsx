import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { render, type RenderOptions } from "@testing-library/react"
import { createContext, type ReactElement, type ReactNode, useContext } from "react"
import { I18nextProvider } from "react-i18next"

import { TooltipProvider } from "@/components/ui/tooltip"
import { i18n } from "@/i18n/i18n"
import { createTestQueryClient } from "@/test/query-client"
import { createTestRouter, type TestRouterOptions } from "@/test/router"

type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  queryClient?: QueryClient
  router?: false | TestRouterOptions
}

const TestRouteContentContext = createContext<ReactNode>(null)

// Test helpers are not loaded through React Fast Refresh.
// oxlint-disable-next-line react/only-export-components
function TestRouteContent() {
  return <>{useContext(TestRouteContentContext)}</>
}

export function renderWithProviders(
  ui: ReactElement,
  {
    queryClient = createTestQueryClient(),
    router = {},
    ...renderOptions
  }: RenderWithProvidersOptions = {},
) {
  const testRouter = router === false ? undefined : createTestRouter(<TestRouteContent />, router)

  function Wrapper({ children }: { children: ReactNode }) {
    const content = testRouter ? (
      <TestRouteContentContext value={children}>
        <RouterProvider router={testRouter} />
      </TestRouteContentContext>
    ) : (
      children
    )

    return (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>{content}</TooltipProvider>
        </QueryClientProvider>
      </I18nextProvider>
    )
  }

  const renderResult = render(ui, {
    wrapper: Wrapper,
    ...renderOptions,
  })

  return {
    queryClient,
    router: testRouter,
    ...renderResult,
  }
}
