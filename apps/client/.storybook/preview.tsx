import type { Decorator, Preview } from "@storybook/tanstack-react"
import { QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

import "../src/styles/globals.css"
import { createTestQueryClient } from "../src/test/query-client"

const withQueryClient: Decorator = (Story) => {
  const [queryClient] = useState(createTestQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <Story />
    </QueryClientProvider>
  )
}

const preview: Preview = {
  decorators: [withQueryClient],

  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
