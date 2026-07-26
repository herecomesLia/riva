import addonA11y from "@storybook/addon-a11y"
import addonDocs from "@storybook/addon-docs"
import { definePreview } from "@storybook/tanstack-react"

import "../src/styles/globals.css"
import { withAppProviders } from "./decorators/with-app-providers"

const preview = definePreview({
  addons: [addonA11y(), addonDocs()],

  decorators: [withAppProviders],

  globalTypes: {
    locale: {
      description: "Story language",
      toolbar: {
        title: "Language",
        icon: "globe",
        dynamicTitle: true,
        items: [
          {
            value: "zh-CN",
            title: "简体中文",
          },
          {
            value: "en",
            title: "English",
          },
        ],
      },
    },

    theme: {
      description: "Story theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        dynamicTitle: true,
        items: [
          {
            value: "light",
            title: "Light",
          },
          {
            value: "dark",
            title: "Dark",
          },
        ],
      },
    },
  },

  initialGlobals: {
    locale: "zh-CN",
    theme: "light",
  },

  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
})

export default preview
