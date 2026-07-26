import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { defineMain } from "@storybook/tanstack-react/node"

function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)))
}

export default defineMain({
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],

  addons: [
    getAbsolutePath("@chromatic-com/storybook"),
    getAbsolutePath("@storybook/addon-a11y"),
    getAbsolutePath("@storybook/addon-docs"),
    getAbsolutePath("@storybook/addon-vitest"),
    getAbsolutePath("@storybook/addon-mcp"),
  ],

  framework: {
    name: "@storybook/tanstack-react",
    options: {},
  },

  viteFinal: (config) => ({
    ...config,
    define: {
      ...config.define,
      "import.meta.env.MOCK": JSON.stringify("true"),
    },
  }),
})
