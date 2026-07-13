import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  define: {
    "import.meta.env.DASHBOARD_MOCK_SCENARIO": JSON.stringify(
      process.env.DASHBOARD_MOCK_SCENARIO ?? "",
    ),
    "import.meta.env.MOCK": JSON.stringify(process.env.MOCK ?? ""),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    projects: [
      {
        extends: true,
        define: {
          "import.meta.env.DASHBOARD_MOCK_SCENARIO": JSON.stringify(""),
          "import.meta.env.MOCK": JSON.stringify(""),
        },
        test: {
          name: "default",
        },
      },
      {
        extends: true,
        define: {
          "import.meta.env.DASHBOARD_MOCK_SCENARIO": JSON.stringify(""),
          "import.meta.env.MOCK": JSON.stringify("true"),
        },
        test: {
          name: "mock",
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: "chromium",
              },
            ],
          },
        },
      },
    ],
  },
})
