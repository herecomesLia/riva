import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { render, type RenderOptions } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"
import { I18nextProvider } from "react-i18next"

import { TooltipProvider } from "@/components/ui/tooltip"
import { i18n } from "@/i18n/i18n"
import { createTestQueryClient } from "@/test/query-client"
import { createTestRouter, type TestRouterOptions } from "@/test/router"

type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  queryClient?: QueryClient
  router?: false | TestRouterOptions
}

export function renderWithProviders(
  ui: ReactElement,
  {
    queryClient = createTestQueryClient(),
    router = {},
    ...renderOptions
  }: RenderWithProvidersOptions = {},
) {
  const testRouter = router === false ? undefined : createTestRouter(ui, router)

  function Wrapper({ children }: { children: ReactNode }) {
    const content = testRouter ? <RouterProvider router={testRouter} /> : children

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
